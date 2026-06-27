module.exports = {
  transform: {
    "^.+\\.(ts|js)x?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.spec.json",
      },
    ],
  },
  testEnvironment: "node",
  testRegex: "(/src/.*\\.(test|spec))\\.(ts|js)x?$",
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.{js,ts}"],
  testPathIgnorePatterns: ["/node_modules/", "/.cache/", "/dist/"],
  transformIgnorePatterns: ["/node_modules/(?!(medusa|@medusajs)/)"],
};
