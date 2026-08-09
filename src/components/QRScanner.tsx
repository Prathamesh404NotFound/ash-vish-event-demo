import React from 'react';
import { TicketScanner } from './TicketScanner';

export const QRScanner: React.FC = () => {
  return <TicketScanner title="Live Gate Pass Validator" subtitle="Scan physical or mobile QR tickets to verify authenticity and record gate entry." />;
};
