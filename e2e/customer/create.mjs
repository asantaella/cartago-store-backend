export const createCustomer = (medusa, { customer }) =>
  medusa.customers.create({ ...customer }).then(({ customer }) => {
    console.log("CUSTOMER [CREATED]");
    return customer;
  });
