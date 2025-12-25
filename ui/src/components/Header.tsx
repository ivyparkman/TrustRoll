import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div>
          <p className="eyebrow">Encrypted lottery playground</p>
          <h1 className="title">TrustRoll</h1>
          <p className="lede">
            Swap ETH for fully homomorphic points, pick two private numbers, and decrypt winnings without ever exposing
            your choices.
          </p>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
