
try {
    console.log("Intentando requerir nodemailer-express-handlebars...");
    const hbs = require("nodemailer-express-handlebars");
    console.log("Requerido exitosamente:", hbs);
} catch (error) {
    console.error("Error al requerir nodemailer-express-handlebars:", error);
    process.exit(1);
}
