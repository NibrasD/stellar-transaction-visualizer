import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors flex-shrink-0 ${className}`}
      title={`Copy ${label || 'text'}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-600" />
          <span className="text-green-600 font-medium">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-gray-700 font-medium">Copy</span>
        </>
      )}
    </button>
  );
}
