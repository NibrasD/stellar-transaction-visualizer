import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

interface TransactionSearchProps {
  onSearch: (value: string) => void;
  isLoading: boolean;
}

export function TransactionSearch({ onSearch, isLoading }: TransactionSearchProps) {
  const [searchValue, setSearchValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      onSearch(searchValue.trim());
    }
  };

  const handleClear = () => {
    setSearchValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Enter Stellar transaction hash..."
            className="w-full pl-10 pr-10 py-3 text-gray-900 bg-white border border-gray-200 rounded-lg
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder:text-gray-400"
            disabled={isLoading}
          />
          {searchValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center hover:bg-gray-100 rounded-full"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !searchValue.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                   flex items-center gap-2 font-medium"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Searching...</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span>Search</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}