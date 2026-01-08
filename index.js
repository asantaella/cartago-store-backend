const express = require("express");
const { GracefulShutdownServer } = require("medusa-core-utils");

const loaders = require("@medusajs/medusa/dist/loaders/index").default;

/**
 * Monkey-patch Medusa's provider services to fix empty criteria bug
 * Issue: Some Medusa services try to update() with empty {} criteria, which TypeORM rejects
 * This affects: PaymentProviderService, NotificationService, FulfillmentProviderService, TaxProviderService
 */
const patchMedusaProviders = () => {
  try {
    // Patch Repository.prototype.update to handle empty criteria
    const typeorm = require("typeorm");
    const originalUpdate = typeorm.Repository.prototype.update;

    typeorm.Repository.prototype.update = function (
      criteria,
      partialEntity,
      options
    ) {
      // If criteria is an empty object and we're setting is_installed: false,
      // change criteria to { is_installed: true } instead
      const validCriteria =
        typeof criteria === "object" &&
        Object.keys(criteria).length === 0 &&
        partialEntity &&
        typeof partialEntity === "object" &&
        partialEntity.is_installed === false
          ? { is_installed: true }
          : criteria;

      return originalUpdate.call(this, validCriteria, partialEntity, options);
    };

    console.log("[MEDUSA FIX] Provider registration patched successfully");
  } catch (error) {
    // If TypeORM isn't available or already patched, continue anyway
  }
};

patchMedusaProviders();
(async () => {
  async function start() {
    const app = express();
    const directory = process.cwd();

    try {
      const { container } = await loaders({
        directory,
        expressApp: app,
      });
      const configModule = container.resolve("configModule");
      const port = process.env.PORT ?? configModule.projectConfig.port ?? 9000;

      const server = GracefulShutdownServer.create(
        app.listen(port, (err) => {
          if (err) {
            return;
          }
          console.log(`Server is ready on port: ${port}`);
        })
      );

      // Handle graceful shutdown
      const gracefulShutDown = () => {
        server
          .shutdown()
          .then(() => {
            console.info("Gracefully stopping the server.");
            process.exit(0);
          })
          .catch((e) => {
            console.error("Error received when shutting down the server.", e);
            process.exit(1);
          });
      };
      process.on("SIGTERM", gracefulShutDown);
      process.on("SIGINT", gracefulShutDown);
    } catch (err) {
      console.error("Error starting server", err);
      process.exit(1);
    }
  }

  await start();
})();
