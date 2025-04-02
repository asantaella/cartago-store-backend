module.exports = {
  transform: {
    "^.+\\.(ts|js)x?$": [
      "ts-jest",
      {
        isolatedModules: true,
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
