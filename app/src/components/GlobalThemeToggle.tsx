import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function GlobalThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </button>
  );
}
