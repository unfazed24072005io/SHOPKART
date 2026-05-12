import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  ActivityIndicator,
  FAB,
  Chip,
  Searchbar,
  Menu,
  Text,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { getProducts, deleteProduct } from '../services/woocommerce';

const { width } = Dimensions.get('window');

const ProductListScreen = ({ navigation }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuVisible, setMenuVisible] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const scrollY = new Animated.Value(0);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
  try {
    setLoading(true);
    const data = await getProducts();
    console.log('Loaded products:', data.length);
    console.log('First product:', data[0]); // Add this
    console.log('Product statuses:', data.map(p => ({ name: p.name, status: p.status }))); // Add this
    setProducts(data);
  } catch (error) {
    console.error('Error loading products:', error);
    Alert.alert('Error', 'Failed to load products');
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
};

  const handleRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleDelete = (id, name) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(id);
              Alert.alert('Success', 'Product deleted successfully');
              loadProducts();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ],
      { cancelable: false }
    );
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderGridItem = ({ item }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      activeOpacity={0.9}
    >
      <Card style={styles.gridCard}>
        <Card.Cover
          source={{ uri: item.images[0]?.src || 'https://via.placeholder.com/300' }}
          style={styles.gridImage}
        />
        <Card.Content style={styles.gridContent}>
          <Title numberOfLines={2} style={styles.productTitle}>
            {item.name}
          </Title>
          <View style={styles.priceRow}>
            <Title style={styles.price}>₹{item.price}</Title>
            {item.sale_price && (
              <Paragraph style={styles.originalPrice}>₹{item.regular_price}</Paragraph>
            )}
          </View>
          <View style={styles.stockRow}>
            <Chip
              icon={item.stock_status === 'instock' ? 'check-circle' : 'close-circle'}
              style={item.stock_status === 'instock' ? styles.inStock : styles.outOfStock}
              textStyle={{ fontSize: 10 }}
            >
              {item.stock_status === 'instock' ? 'In Stock' : 'Out of Stock'}
            </Chip>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => navigation.navigate('EditProduct', { productId: item.id })}
                style={styles.iconButton}
              >
                <Ionicons name="pencil" size={20} color="#4CAF50" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.name)}
                style={styles.iconButton}
              >
                <Ionicons name="trash" size={20} color="#f44336" />
              </TouchableOpacity>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const renderListItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      activeOpacity={0.9}
    >
      <Card style={styles.listCard}>
        <View style={styles.listRow}>
          <Card.Cover
            source={{ uri: item.images[0]?.src || 'https://via.placeholder.com/300' }}
            style={styles.listImage}
          />
          <View style={styles.listContent}>
            <Title numberOfLines={2} style={styles.productTitle}>
              {item.name}
            </Title>
            <View style={styles.priceRow}>
              <Title style={styles.price}>₹{item.price}</Title>
              {item.sale_price && (
                <Paragraph style={styles.originalPrice}>₹{item.regular_price}</Paragraph>
              )}
            </View>
            <View style={styles.listFooter}>
              <Chip
                icon={item.stock_status === 'instock' ? 'check-circle' : 'close-circle'}
                style={item.stock_status === 'instock' ? styles.inStock : styles.outOfStock}
                textStyle={{ fontSize: 11 }}
              >
                {item.stock_status === 'instock' ? 'In Stock' : 'Out of Stock'}
              </Chip>
              <View style={styles.actionButtons}>
                <Button
                  mode="outlined"
                  onPress={() => navigation.navigate('EditProduct', { productId: item.id })}
                  style={styles.editButton}
                  compact
                >
                  Edit
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => handleDelete(item.id, item.name)}
                  style={styles.deleteButton}
                  compact
                >
                  Delete
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loaderText}>Loading amazing products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search products..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          iconColor="#6200ee"
        />
        <View style={styles.headerActions}>
          <Menu
            visible={menuVisible === 'view'}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <TouchableOpacity onPress={() => setMenuVisible('view')} style={styles.iconButton}>
                <Ionicons name={viewMode === 'grid' ? 'grid-outline' : 'list-outline'} size={24} color="#6200ee" />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              onPress={() => {
                setViewMode('grid');
                setMenuVisible(null);
              }}
              title="Grid View"
              leadingIcon="grid"
            />
            <Menu.Item
              onPress={() => {
                setViewMode('list');
                setMenuVisible(null);
              }}
              title="List View"
              leadingIcon="format-list-bulleted"
            />
          </Menu>
        </View>
      </View>

      <FlatList
        data={filteredProducts}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        keyExtractor={item => item.id.toString()}
        numColumns={viewMode === 'grid' ? 2 : 1}
        key={viewMode}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#6200ee']} />
        }
        contentContainerStyle={viewMode === 'grid' ? styles.gridContainer : styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={80} color="#ccc" />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
      />

      <FAB
        style={styles.fab}
        icon="plus"
        color="#fff"
        onPress={() => navigation.navigate('AddProduct')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchbar: {
    elevation: 0,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  gridContainer: {
    padding: 8,
    paddingBottom: 80,
  },
  listContainer: {
    padding: 8,
    paddingBottom: 80,
  },
  gridItem: {
    width: (width - 48) / 2,
    margin: 8,
  },
  gridCard: {
    borderRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  gridImage: {
    height: 180,
  },
  gridContent: {
    padding: 12,
  },
  listCard: {
    marginHorizontal: 8,
    marginVertical: 6,
    borderRadius: 12,
    elevation: 2,
  },
  listRow: {
    flexDirection: 'row',
    padding: 12,
  },
  listImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 12,
  },
  listContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  listFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  price: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginRight: 8,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
    fontSize: 14,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  inStock: {
    backgroundColor: '#E8F5E9',
  },
  outOfStock: {
    backgroundColor: '#FFEBEE',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  editButton: {
    marginRight: 8,
    borderColor: '#4CAF50',
  },
  deleteButton: {
    borderColor: '#f44336',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200ee',
    borderRadius: 28,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loaderText: {
    marginTop: 16,
    color: '#6200ee',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
});

export default ProductListScreen;