import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import ThemeToggle from './ThemeToggle';
import OrganizationSwitcher from './OrganizationSwitcher';
import { useEffect } from 'react';

export default function Layout() {
  const { isAuthenticated, logout, isLoading, hasOrganizations } = useAuth();
  const { isLoading: orgLoading } = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    // Only redirect to create-organization if we're certain the user has no organizations
    // hasOrganizations will be null until the check is complete, false if no orgs, true if has orgs
    if (!isLoading && isAuthenticated && hasOrganizations === false && location.pathname !== '/create-organization') {
      navigate('/create-organization');
    }
  }, [isAuthenticated, isLoading, hasOrganizations, navigate, location.pathname]);

  if (isLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => {
    return location.pathname === path || 
           (path === '/vms' && location.pathname.startsWith('/vms')) ||
           (path === '/projects' && location.pathname.startsWith('/projects')) ||
           (path === '/scripts' && location.pathname.startsWith('/scripts')) ||
           (path === '/moments' && location.pathname.startsWith('/moments')) ||
           (path === '/organization/settings' && location.pathname.startsWith('/organization')) ||
           (path === '/user/settings' && location.pathname.startsWith('/user'));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-te-gray-300 dark:border-te-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-base font-semibold uppercase tracking-wider">
                Facet <span className="text-te-gray-500 dark:text-te-gray-600">Build</span>
              </h1>
              
              <div className="flex space-x-1">
                <Link
                  to="/"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/') || isActive('/vms')
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Virtual Machines
                </Link>
                <Link
                  to="/scripts"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/scripts')
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Scripts
                </Link>
                <Link
                  to="/moments"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/moments')
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Moments
                </Link>
                <Link
                  to="/organization/settings"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/organization/settings') 
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Organization
                </Link>
                <Link
                  to="/user/settings"
                  className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                    isActive('/user/settings') 
                      ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow' 
                      : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
                  }`}
                >
                  Account
                </Link>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <OrganizationSwitcher />
              <div className="h-6 w-px bg-te-gray-300 dark:bg-te-gray-700" />
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
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