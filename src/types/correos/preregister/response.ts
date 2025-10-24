import PreregisterOrderService from "../../../services/preregister-order";

export interface PreregisterOrderDto {
  fileIdentifier: string;
  result: string;
  shipments: Shipments[];
}

export interface Shipments {
  validationErrorCount: number;
  error: PreregisterErrorDto[];
  shipmentCode: string;
  packages: Packages[];
  entryDate: string;
}

export interface Packages {
  packageId: string;
  packageCode: string;
}

export interface PreregisterErrorDto {
  errorCode: number;
  description: string;
  errorFieldName: string;
}

export type PreregisterOrderResponse = PreregisterOrderDto & {
  orderNumber: string;
};
