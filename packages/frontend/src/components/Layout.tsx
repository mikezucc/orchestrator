import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const isActive = (path: string) => {
    return location.pathname === path || (path === '/vms' && location.pathname.startsWith('/vms'));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-te-gray-300 dark:border-te-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-base font-semibold uppercase tracking-wider">
                GCE<span className="text-te-gray-500 dark:text-te-gray-600">//</span>VM
              </h1>
              
              <div className="flex space-x-1">
                <Link
                  to="/"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/') 
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/vms"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/vms') 
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Virtual Machines
                </Link>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <button
                onClick={logout}
                className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-te-gray-300 dark:border-te-gray-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
            GCE VM Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}