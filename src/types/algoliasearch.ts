import { SearchClient } from "@algolia/client-search";

declare function algoliasearch(
  applicationID: string,
  apiKey: string,
  options?: object
): SearchClient;

export default algoliasearch;
