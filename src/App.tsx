import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { NetworkSelector } from './components/NetworkSelector';
import { ContractSimulator } from './components/ContractSimulator';
import { TransactionPage } from './components/TransactionPage';
import { setNetwork } from './services/stellar';
import type { NetworkConfig } from './types/stellar';

function AppLayout() {
  const { network } = useParams<{ network: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isTestnet = network === 'testnet';

  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    isTestnet,
    networkUrl: isTestnet
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org',
    networkPassphrase: isTestnet
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015',
  });

  // Sync network config when URL network param changes
  useEffect(() => {
    const urlIsTestnet = network === 'testnet';
    if (networkConfig.isTestnet !== urlIsTestnet) {
      const newConfig: NetworkConfig = {
        isTestnet: urlIsTestnet,
        networkUrl: urlIsTestnet
          ? 'https://horizon-testnet.stellar.org'
          : 'https://horizon.stellar.org',
        networkPassphrase: urlIsTestnet
          ? 'Test SDF Network ; September 2015'
          : 'Public Global Stellar Network ; September 2015',
      };
      setNetworkConfig(newConfig);
      setNetwork(newConfig);
    }
  }, [network]);

  // Initialize network on mount
  useEffect(() => {
    setNetwork(networkConfig);
  }, []);

  const handleNetworkChange = (config: NetworkConfig) => {
    setNetworkConfig(config);
    setNetwork(config);
    // Navigate to the same sub-path but with different network prefix
    const newNetwork = config.isTestnet ? 'testnet' : 'mainnet';
    const currentPath = location.pathname;
    // Replace the network segment in the current path
    const pathAfterNetwork = currentPath.replace(/^\/(mainnet|testnet)/, '');
    navigate(`/${newNetwork}${pathAfterNetwork || ''}`);
  };

  // Determine which nav item is active
  const isSimulatorActive = location.pathname.includes('/simulator');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <NavLink to={`/${network}`} className="flex items-center gap-3 no-underline">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              Stellar Transaction Visualizer
            </h1>
          </NavLink>
          <NetworkSelector config={networkConfig} onConfigChange={handleNetworkChange} />
        </div>

        <div className="space-y-6">
          <div className="flex space-x-2 border-b border-gray-200 bg-white rounded-t-xl px-4">
            <NavLink
              to={`/${network}`}
              end
              className={({ isActive }) =>
                `px-4 py-3 font-medium border-b-2 transition-colors no-underline ${
                  isActive && !isSimulatorActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`
              }
            >
              Transaction Search
            </NavLink>
            <NavLink
              to={`/${network}/simulator`}
              className={({ isActive }) =>
                `px-4 py-3 font-medium border-b-2 transition-colors no-underline ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`
              }
            >
              Contract Simulator
            </NavLink>
          </div>

          <Routes>
            <Route index element={<TransactionPage networkConfig={networkConfig} />} />
            <Route path="tx/:hash/:tab?" element={<TransactionPage networkConfig={networkConfig} />} />
            <Route path="simulator" element={
              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <ContractSimulator networkConfig={networkConfig} />
              </div>
            } />
          </Routes>
        </div>
        
        <footer className="mt-12 py-8 border-t border-gray-200 text-center flex flex-col items-center gap-2">
          <p className="text-sm text-gray-600">
            Support us on X: <a href="https://x.com/Stellar_Viz" target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">@Stellar_Viz</a>
          </p>
          <a
            href="https://github.com/NibrasD/stellar-transaction-visualizer"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-blue-600 font-bold hover:underline text-sm"
          >
            GitHub Repository
          </a>
        </footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/mainnet" replace />} />
      <Route path="/:network/*" element={<AppLayout />} />
    </Routes>
  );
}

export default App;