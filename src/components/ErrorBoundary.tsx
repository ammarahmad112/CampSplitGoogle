import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { STORAGE_KEY } from '../lib/storage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Camp Split render error:', error, info);
  }

  handleDownloadRawBackup = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '{}';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `camp-split-emergency-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // ignore
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 dark:bg-slate-950 text-stone-900 dark:text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-xl p-6 text-center space-y-4">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              Your trip data is still safely stored in this browser. Download a quick backup or reload the page to recover.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleDownloadRawBackup}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Download safety backup
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
