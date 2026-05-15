(async () => {
  await import("./index.mjs");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
