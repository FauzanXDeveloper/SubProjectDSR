/* ============================================================
   products.js - the product list. One line per product.

   To ADD a product: create products/<id>/<id>.js (it calls
   App.registerProduct) and add its path to the list below.

   To REMOVE a product: delete its folder and delete its line below.
   Combo modes (PF + HF, PF + CC, HF + CC) are built automatically
   from the products listed here, so they disappear with them.
   ============================================================ */
window.DSR_PRODUCT_FILES = [
  'products/pf/pf.js',
  'products/hf/hf.js',
  'products/cc/cc.js'
];
