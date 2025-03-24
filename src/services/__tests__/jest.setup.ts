// Configuración global para tests de Jest

import { Container } from "typedi";
import path from "path";
import dotenv from "dotenv";

// Cargar variables de entorno desde el archivo .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Aumentar timeout para tests de integración
jest.setTimeout(30000);

// Limpiar el contenedor de typedi antes de cada test
beforeEach(() => {
  Container.reset();
});

// Configurar mock global para console.log para tests más limpios
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
