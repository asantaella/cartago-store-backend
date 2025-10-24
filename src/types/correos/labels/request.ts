export interface PrintLabelRequest {
  application: string;
  documentationType: number;
  print: {
    labelOrderType: number;
    labelFormat: number;
    labelPrintMode: number;
    labelPrintInitialPosition: number;
    shipments: string[];
  };
}
