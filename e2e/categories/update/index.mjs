import Medusa from "@medusajs/medusa-js";

const BASE_URL = "http://localhost:9000";
const medusa = new Medusa({ baseUrl: BASE_URL, maxRetries: 3 });
const categoryId = "pcat_accesorios-motor";

await medusa.admin.auth.getToken({
  email: "admin@medusa-test.com",
  password: "supersecret",
});

const metadata = { key: "image", value: "foo" };

medusa.admin.productCategories
  .create({ name: "foo example", metadata: { image: "image url" } })
  .then(({ product_category }) => {
    console.log(product_category);
  });
