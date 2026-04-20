import { makeTxnApi } from "./txnApi";

const verification = makeTxnApi("verification");

export const validateVerification = verification.validate;
export const confirmVerification = verification.confirm;
export const getVerificationBatches = verification.listBatches;
export const getVerificationBatchDetail = verification.getBatchDetail;
export const getVerificationDeletionPreview = verification.getDeletionPreview;
export const deleteVerificationBatch = verification.deleteBatch;
export const approveVerificationBatch = verification.approveBatch;
export const rejectVerificationBatch = verification.rejectBatch;
export const getVerificationOverview = verification.overview;
