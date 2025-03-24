import { medusa } from "../auth/index.mjs";

async function testResetPassword() {
  try {
    // Solicitar restablecimiento de contraseña para un correo existente

    console.log("Requesting password reset...");
    await medusa.customers.generatePasswordToken({
      email: "a.santaella.m+3@gmail.com",
    });

    console.log("Password reset response successful!");
    console.log("Check your mailbox for reset password email!");
  } catch (error) {
    console.error("Error testing reset password:", error.message);
    if (error.response) {
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
  }
}

testResetPassword();
