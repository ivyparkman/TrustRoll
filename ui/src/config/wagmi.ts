import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'TrustRoll',
  projectId: '2e6f2c6c4d1e5b3f8a0c2e7d9f8a3c2b',
  chains: [sepolia],
  ssr: false,
});
