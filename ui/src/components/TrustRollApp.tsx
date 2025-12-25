import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract, parseEther } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';

type TicketCipher = {
  first: string | null;
  second: string | null;
  exists: boolean;
};

type DrawCipher = {
  first: string | null;
  second: string | null;
  reward: string | null;
};

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function TrustRollApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const contractConfig = useMemo(
    () => ({ address: CONTRACT_ADDRESS as `0x${string}`, abi: CONTRACT_ABI }),
    [],
  );

  const [ethAmount, setEthAmount] = useState('0.1');
  const [pick, setPick] = useState({ first: 1, second: 2 });
  const [balanceHandle, setBalanceHandle] = useState<string | null>(null);
  const [balancePlain, setBalancePlain] = useState<string | null>(null);
  const [ticketCipher, setTicketCipher] = useState<TicketCipher>({ first: null, second: null, exists: false });
  const [ticketPlain, setTicketPlain] = useState<{ first: string; second: string } | null>(null);
  const [drawCipher, setDrawCipher] = useState<DrawCipher>({ first: null, second: null, reward: null });
  const [drawPlain, setDrawPlain] = useState<{ first: string; second: string; reward: string } | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isBuyingTicket, setIsBuyingTicket] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [gameParams, setGameParams] = useState({ rate: 10000, cost: 10, oneReward: 100, twoReward: 1000 });

  const connectedCopy = useMemo(() => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const resetState = () => {
    setBalanceHandle(null);
    setBalancePlain(null);
    setTicketCipher({ first: null, second: null, exists: false });
    setTicketPlain(null);
    setDrawCipher({ first: null, second: null, reward: null });
    setDrawPlain(null);
  };

  const fetchParams = async () => {
    if (!publicClient) return;
    try {
      const [rate, cost, oneReward, twoReward] = await Promise.all([
        publicClient.readContract({ ...contractConfig, functionName: 'POINTS_PER_ETH' }) as Promise<number>,
        publicClient.readContract({ ...contractConfig, functionName: 'TICKET_COST' }) as Promise<number>,
        publicClient.readContract({ ...contractConfig, functionName: 'ONE_MATCH_REWARD' }) as Promise<number>,
        publicClient.readContract({ ...contractConfig, functionName: 'TWO_MATCH_REWARD' }) as Promise<number>,
      ]);
      setGameParams({
        rate: Number(rate),
        cost: Number(cost),
        oneReward: Number(oneReward),
        twoReward: Number(twoReward),
      });
    } catch (error) {
      console.error('Failed to load contract parameters', error);
    }
  };

  const fetchBalance = async () => {
    if (!publicClient || !address) return;
    try {
      const encryptedBalance = await publicClient.readContract({
        ...contractConfig,
        functionName: 'getEncryptedBalance',
        args: [address],
      });
      setBalanceHandle(encryptedBalance as string);
      setBalancePlain(null);
    } catch (error) {
      console.error('Failed to fetch encrypted balance', error);
    }
  };

  const fetchTicket = async () => {
    if (!publicClient || !address) return;
    try {
      const [first, second, exists] = (await publicClient.readContract({
        ...contractConfig,
        functionName: 'getTicket',
        args: [address],
      })) as [string, string, boolean];

      setTicketCipher({
        first: first as string,
        second: second as string,
        exists,
      });
      setTicketPlain(null);
    } catch (error) {
      console.error('Failed to fetch ticket', error);
    }
  };

  const fetchLastDraw = async () => {
    if (!publicClient || !address) return;
    try {
      const [first, second, reward] = (await publicClient.readContract({
        ...contractConfig,
        functionName: 'getLastDraw',
        args: [address],
      })) as [string, string, string];
      setDrawCipher({ first, second, reward });
      setDrawPlain(null);
    } catch (error) {
      console.error('Failed to fetch last draw', error);
    }
  };

  const refreshAccountData = async () => {
    await Promise.all([fetchBalance(), fetchTicket(), fetchLastDraw()]);
  };

  useEffect(() => {
    fetchParams();
  }, [publicClient]);

  useEffect(() => {
    if (address && isConnected) {
      refreshAccountData();
    } else {
      resetState();
    }
  }, [address, isConnected]);

  const decryptHandles = async (handles: string[]) => {
    if (!instance || !address || handles.length === 0) {
      throw new Error('Missing encryption context');
    }
    if (!signerPromise) {
      throw new Error('Wallet signer unavailable');
    }

    const signer = await signerPromise;
    const keypair = instance.generateKeypair();
    const startTimestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '7';
    const eip712 = instance.createEIP712(keypair.publicKey, [CONTRACT_ADDRESS], startTimestamp, durationDays);

    const signature = await signer.signTypedData(
      eip712.domain,
      { [eip712.primaryType]: eip712.types[eip712.primaryType] },
      eip712.message,
    );

    const results = await instance.userDecrypt(
      handles.map((handle) => ({ handle, contractAddress: CONTRACT_ADDRESS })),
      keypair.privateKey,
      keypair.publicKey,
      signature,
      [CONTRACT_ADDRESS],
      address,
      startTimestamp,
      durationDays,
    );

    return results as Record<string, bigint | boolean | string>;
  };

  const handleDecryptBalance = async () => {
    if (!balanceHandle || balanceHandle === ZERO_HANDLE) return;
    try {
      const result = await decryptHandles([balanceHandle]);
      const value = result[balanceHandle];
      setBalancePlain(value ? value.toString() : null);
    } catch (error) {
      console.error('Failed to decrypt balance', error);
      setStatus('Could not decrypt balance. Please retry.');
    }
  };

  const handleDecryptTicket = async () => {
    if (!ticketCipher.exists || !ticketCipher.first || !ticketCipher.second) return;
    if (ticketCipher.first === ZERO_HANDLE || ticketCipher.second === ZERO_HANDLE) return;
    try {
      const result = await decryptHandles([ticketCipher.first, ticketCipher.second]);
      setTicketPlain({
        first: result[ticketCipher.first]?.toString() ?? '',
        second: result[ticketCipher.second]?.toString() ?? '',
      });
    } catch (error) {
      console.error('Failed to decrypt ticket', error);
      setStatus('Could not decrypt ticket numbers.');
    }
  };

  const handleDecryptDraw = async () => {
    if (!drawCipher.first || !drawCipher.second || !drawCipher.reward) return;
    if ([drawCipher.first, drawCipher.second, drawCipher.reward].includes(ZERO_HANDLE)) return;
    try {
      const result = await decryptHandles([drawCipher.first, drawCipher.second, drawCipher.reward]);
      setDrawPlain({
        first: result[drawCipher.first]?.toString() ?? '',
        second: result[drawCipher.second]?.toString() ?? '',
        reward: result[drawCipher.reward]?.toString() ?? '',
      });
    } catch (error) {
      console.error('Failed to decrypt draw', error);
      setStatus('Could not decrypt draw result.');
    }
  };

  const handlePurchasePoints = async () => {
    if (!address) {
      setStatus('Connect your wallet to mint points.');
      return;
    }
    if (!signerPromise) {
      setStatus('Signer unavailable');
      return;
    }
    try {
      const value = parseEther(ethAmount || '0');
      setIsPurchasing(true);
      setStatus('Waiting for confirmation...');
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.purchasePoints({ value });
      await tx.wait();
      await fetchBalance();
      setStatus('Encrypted points added to your balance.');
    } catch (error) {
      console.error('Failed to purchase points', error);
      setStatus('Could not purchase points. Check funds and network.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handlePurchaseTicket = async () => {
    if (!address) {
      setStatus('Connect your wallet to buy a ticket.');
      return;
    }
    if (!instance) {
      setStatus('Encryption not ready yet.');
      return;
    }
    if (!signerPromise) {
      setStatus('Signer unavailable');
      return;
    }
    if (![pick.first, pick.second].every((n) => n >= 1 && n <= 9)) {
      setStatus('Numbers must be between 1 and 9.');
      return;
    }
    try {
      setIsBuyingTicket(true);
      setStatus('Encrypting your numbers...');
      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .add8(pick.first)
        .add8(pick.second)
        .encrypt();

      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.purchaseTicket(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.inputProof,
      );
      await tx.wait();
      await refreshAccountData();
      setStatus('Ticket purchased. Ready for the draw.');
    } catch (error) {
      console.error('Failed to purchase ticket', error);
      setStatus('Ticket purchase failed. Ensure you have at least 10 points.');
    } finally {
      setIsBuyingTicket(false);
    }
  };

  const handlePlayRound = async () => {
    if (!address) {
      setStatus('Connect your wallet to start the draw.');
      return;
    }
    if (!ticketCipher.exists) {
      setStatus('Buy a ticket before starting a draw.');
      return;
    }
    if (!signerPromise) {
      setStatus('Signer unavailable');
      return;
    }
    try {
      setIsDrawing(true);
      setStatus('Calling the Zama coprocessor for random numbers...');
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.playRound();
      await tx.wait();
      await fetchBalance();
      await fetchLastDraw();
      setStatus('Draw complete. Decrypt to see results.');
    } catch (error) {
      console.error('Failed to play round', error);
      setStatus('Draw failed. Check that a ticket is active.');
    } finally {
      setIsDrawing(false);
    }
  };

  const hasTicket = ticketCipher.exists && ticketCipher.first !== ZERO_HANDLE && ticketCipher.second !== ZERO_HANDLE;
  const hasDraw =
    drawCipher.first !== null &&
    drawCipher.second !== null &&
    drawCipher.reward !== null &&
    drawCipher.first !== ZERO_HANDLE &&
    drawCipher.second !== ZERO_HANDLE &&
    drawCipher.reward !== ZERO_HANDLE;

  return (
    <main className="content">
      <section className="hero">
        <div className="hero-copy">
          <div className="pill">1 ETH = {gameParams.rate.toLocaleString()} pts</div>
          <h2>Double-ball draws with encrypted bankroll</h2>
          <p>
            Deposit ETH to mint points, pick two hidden numbers between 1 and 9, and launch a Zama-powered draw. Rewards
            stay encrypted until you ask to decrypt.
          </p>
          <div className="tags">
            <span className="tag">Cost {gameParams.cost} pts</span>
            <span className="tag">1 match = {gameParams.oneReward} pts</span>
            <span className="tag">2 matches = {gameParams.twoReward} pts</span>
          </div>
          {zamaError && <p className="warning">Encryption bootstrap failed: {zamaError}</p>}
        </div>
        <div className="summary">
          <div className="summary-row">
            <span>Connected</span>
            <strong>{connectedCopy || 'Wallet not connected'}</strong>
          </div>
          <div className="summary-row">
            <span>Zama relayer</span>
            <strong>{zamaLoading ? 'Loading...' : instance ? 'Ready' : 'Unavailable'}</strong>
          </div>
          <div className="summary-row">
            <span>Contract</span>
            <strong>{CONTRACT_ADDRESS}</strong>
          </div>
          {status && <div className="status">{status}</div>}
        </div>
      </section>

      <div className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Encrypted balance</p>
              <h3>Points vault</h3>
            </div>
            <button className="ghost" onClick={handleDecryptBalance} disabled={!balanceHandle || balanceHandle === ZERO_HANDLE}>
              Decrypt balance
            </button>
          </div>
          <div className="cipher-box">
            <p className="label">Ciphertext handle</p>
            <p className="mono">{balanceHandle || 'No balance yet'}</p>
          </div>
          <div className="balance-row">
            <div>
              <p className="label">Clear points</p>
              <p className="value">{balancePlain ?? 'Decrypt to view'}</p>
            </div>
            <div>
              <p className="label">Ticket cost</p>
              <p className="value">{gameParams.cost} pts</p>
            </div>
          </div>
          <div className="form-row">
            <label>Spend ETH to mint points</label>
            <div className="input-row">
              <input
                type="number"
                min="0"
                step="0.01"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
              />
              <button className="primary" onClick={handlePurchasePoints} disabled={!isConnected || isPurchasing}>
                {isPurchasing ? 'Processing...' : 'Mint encrypted points'}
              </button>
            </div>
            <p className="helper">
              1 ETH mints {gameParams.rate.toLocaleString()} points. Balances stay encrypted until you decrypt them.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Ticket</p>
              <h3>Pick hidden numbers</h3>
            </div>
            <button className="ghost" onClick={handleDecryptTicket} disabled={!hasTicket}>
              Decrypt ticket
            </button>
          </div>
          <div className="ticket-row">
            <div className="ticket-input">
              <label>First</label>
              <select value={pick.first} onChange={(e) => setPick((p) => ({ ...p, first: Number(e.target.value) }))}>
                {Array.from({ length: 9 }).map((_, idx) => (
                  <option key={idx} value={idx + 1}>
                    {idx + 1}
                  </option>
                ))}
              </select>
            </div>
            <div className="ticket-input">
              <label>Second</label>
              <select value={pick.second} onChange={(e) => setPick((p) => ({ ...p, second: Number(e.target.value) }))}>
                {Array.from({ length: 9 }).map((_, idx) => (
                  <option key={idx} value={idx + 1}>
                    {idx + 1}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" onClick={handlePurchaseTicket} disabled={isBuyingTicket || zamaLoading}>
              {isBuyingTicket ? 'Encrypting...' : `Buy ticket (${gameParams.cost} pts)`}
            </button>
          </div>
          <div className="cipher-box">
            <p className="label">Encrypted picks</p>
            {hasTicket ? (
              <>
                <p className="mono">{ticketCipher.first}</p>
                <p className="mono">{ticketCipher.second}</p>
              </>
            ) : (
              <p className="mono">No active ticket</p>
            )}
          </div>
          <div className="balance-row">
            <div>
              <p className="label">Decrypted</p>
              <p className="value">
                {ticketPlain ? `${ticketPlain.first} + ${ticketPlain.second}` : 'Hidden until you decrypt'}
              </p>
            </div>
            <div>
              <p className="label">Ready to draw</p>
              <p className="value">{hasTicket ? 'Yes' : 'Buy a ticket'}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Draw</p>
              <h3>Reveal encrypted results</h3>
            </div>
            <div className="actions">
              <button className="ghost" onClick={handleDecryptDraw} disabled={!hasDraw}>
                Decrypt result
              </button>
              <button className="primary" onClick={handlePlayRound} disabled={isDrawing || !hasTicket}>
                {isDrawing ? 'Drawing...' : 'Start draw'}
              </button>
            </div>
          </div>
          <div className="cipher-box">
            <p className="label">Winning ciphertexts</p>
            {hasDraw ? (
              <>
                <p className="mono">{drawCipher.first}</p>
                <p className="mono">{drawCipher.second}</p>
                <p className="mono">{drawCipher.reward}</p>
              </>
            ) : (
              <p className="mono">No draw yet</p>
            )}
          </div>
          <div className="balance-row">
            <div>
              <p className="label">Winning numbers</p>
              <p className="value">
                {drawPlain ? `${drawPlain.first} & ${drawPlain.second}` : 'Encrypted until you decrypt'}
              </p>
            </div>
            <div>
              <p className="label">Reward</p>
              <p className="value">{drawPlain?.reward ?? 'Encrypted reward'}</p>
            </div>
          </div>
          <p className="helper">
            Rewards are instantly added to your encrypted balance: +{gameParams.oneReward} points for one match, +{gameParams.twoReward} for a perfect pick.
          </p>
        </div>
      </div>
    </main>
  );
}
