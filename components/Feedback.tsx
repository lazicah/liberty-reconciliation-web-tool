'use client';

import { ReactNode } from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Processing...' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
      </div>
      <p className="text-gray-600 text-lg">{message}</p>
    </div>
  );
}

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ title = 'Error', message, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6">
      <h3 className="text-red-800 font-bold text-lg">{title}</h3>
      <p className="text-red-700 mt-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Retry
        </button>
      )}
    </div>
  );
}

interface SuccessMessageProps {
  title?: string;
  message: string;
  children?: ReactNode;
}

export function SuccessMessage({ title = 'Success', message, children }: SuccessMessageProps) {
  return (
    <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6 mb-6">
      <h3 className="text-green-800 font-bold text-lg">{title}</h3>
      <p className="text-green-700 mt-2">{message}</p>
      {children}
    </div>
  );
}
