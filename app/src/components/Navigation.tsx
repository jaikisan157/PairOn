import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Moon, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { NAV_ITEMS } from '@/data/constants';
import { cn } from '@/lib/utils';

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isLandingPage = location.pathname === '/';

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isScrolled
            ? 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm'
            : 'bg-transparent'
        )}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-pairon-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className="font-display font-bold text-xl lg:text-2xl text-gray-900 dark:text-white">
                PairOn
              </span>
            </Link>

            {/* Desktop Navigation */}
            {isLandingPage && (
              <div className="hidden md:flex items-center gap-8">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-pairon-accent dark:hover:text-pairon-accent transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}

            {/* Right Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5 text-gray-600" />
                ) : (
                  <Sun className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Auth Buttons */}
              {isAuthenticated ? (
                <div className="hidden md:flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {user?.credits} credits
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/dashboard')}
                    className="text-sm"
                  >
                    Dashboard
                  </Button>
                  <Button
                    onClick={logout}
                    variant="outline"
                    className="text-sm"
                  >
                    Log out
                  </Button>
                </div>
              ) : (
                <div className="hidden md:flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/login')}
                    className="text-sm"
                  >
                    Log in
                  </Button>
                  <Button
                    onClick={() => navigate('/register')}
                    className="bg-pairon-accent hover:bg-pairon-accent-dark text-white text-sm rounded-full px-5"
                  >
                    Start matching
                  </Button>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-16 z-40 md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-lg"
          >
            <div className="px-4 py-6 space-y-4">
              {isLandingPage && (
                <>
                  {NAV_ITEMS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block text-base font-medium text-gray-700 dark:text-gray-300 hover:text-pairon-accent"
                    >
                      {item.label}
                    </a>
                  ))}
                  <hr className="border-gray-200 dark:border-gray-800" />
                </>
              )}
              
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => {
                      navigate('/dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-base font-medium text-gray-700 dark:text-gray-300"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-base font-medium text-red-600"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      navigate('/login');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-base font-medium text-gray-700 dark:text-gray-300"
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => {
                      navigate('/register');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-base font-medium text-pairon-accent"
                  >
                    Start matching
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
