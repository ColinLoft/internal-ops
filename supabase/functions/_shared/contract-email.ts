import { deliverOperationalEmail, type OperationalEmail } from './operational-mail.ts';

export type ContractEmail = OperationalEmail;
export const deliverContractEmail = deliverOperationalEmail;
