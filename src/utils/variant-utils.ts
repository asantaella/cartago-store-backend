export const formatVariantCategories = (variant) => {
  const variantCategories = variant.product.categories;
  if (!variantCategories || variantCategories.length === 0) {
    return [];
  }
  return variantCategories.length > 1
    ? variantCategories
        .sort((c1, c2) => {
          return (
            (((c1?.metadata?.order + 1) as number) || 1000) -
            (((c2?.metadata?.order + 1) as number) || 1000)
          );
        })
        .slice(0, 2)
        .map((c) => c.name)
        .join(" ")
    : [variantCategories[0]?.name];
};
