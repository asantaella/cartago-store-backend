import Medusa from "@medusajs/medusa-js";

const BASE_URL = "http://localhost:9000";
const medusa = new Medusa({ baseUrl: BASE_URL, maxRetries: 3 });
const productId = "prod_01HAJ2HKNVKPSD7TQG61S67CXY";

await medusa.admin.auth.getToken({
  email: "admin@medusa-test.com",
  password: "supersecret",
});

medusa.admin.products
  .update(productId, {
    thumbnail:
      "https://pub-9f70c8529e1d47ab90225640bcffecd9.r2.dev/Anclaje batería/thumb.jpg",
  })
  .then(({ product }) => {
    console.log(product.id);
  });
