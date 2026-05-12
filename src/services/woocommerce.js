const API_URL = "https://acw.ind.in/wp-json/wc/v3";
const CONSUMER_KEY = "ck_c8144e0657c7360736cf4d05987f544b1bd5f71b";
const CONSUMER_SECRET = "cs_efb685a3e88d7166d21f1e6360fc49e531ad2db0";

export const getProducts = async (page = 1, perPage = 100) => {
  try {
    // Add status=any to get all products including drafts
    const url = `${API_URL}/products?per_page=${perPage}&page=${page}&status=any&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Products loaded:", data.length);
    console.log("First product status:", data[0]?.status);
    return data;
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
};

export const createProduct = async (productData) => {
  try {
    const url = `${API_URL}/products?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData)
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
};

export const updateProduct = async (id, productData) => {
  try {
    const url = `${API_URL}/products/${id}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData)
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
};

export const deleteProduct = async (id) => {
  try {
    const url = `${API_URL}/products/${id}?force=true&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    const response = await fetch(url, {
      method: 'DELETE',
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
};