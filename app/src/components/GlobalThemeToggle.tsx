import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function GlobalThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-pairon-accent dark:hover:text-pairon-accent transition-all z-50 hover:scale-110 group"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 sm:w-6 sm:h-6 group-hover:rotate-12 transition-transform" />
      ) : (
        <Sun className="w-5 h-5 sm:w-6 sm:h-6 group-hover:rotate-45 transition-transform" />
      )}
    </button>
  );
}
