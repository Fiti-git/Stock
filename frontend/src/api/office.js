import { makeTxnApi } from "./txnApi";

const office = makeTxnApi("office");

export const validateOffice = office.validate;
export const confirmOffice = office.confirm;
export const getOfficeBatches = office.listBatches;
export const getOfficeBatchDetail = office.getBatchDetail;
export const getOfficeDeletionPreview = office.getDeletionPreview;
export const deleteOfficeBatch = office.deleteBatch;
export const approveOfficeBatch = office.approveBatch;
export const rejectOfficeBatch = office.rejectBatch;
export const getOfficeOverview = office.overview;
