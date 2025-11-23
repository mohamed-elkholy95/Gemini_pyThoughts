
import React, { useState, useEffect } from 'react';
import { Menu, Search, Moon, Sun, Edit3, Bell, User, Book, FileText, BarChart2, Settings, LogOut, HelpCircle } from 'lucide-react';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { SidebarRightArticle } from './components/SidebarRightArticle';
import { SidebarRightProfile } from './components/SidebarRightProfile';
import { ArticleCard } from './components/ArticleCard';
import { ArticlePage } from './components/ArticlePage';
import { LandingPage } from './components/LandingPage';
import { StoragePage } from './components/StoragePage';
import { ProfilePage } from './components/ProfilePage';
import { StatsPage } from './components/StatsPage';
import { DraftsPage } from './components/DraftsPage';
import { FollowingPage } from './components/FollowingPage';
import { PersonProfilePage } from './components/PersonProfilePage';
import { EditorPage } from './components/EditorPage';
import { MOCK_ARTICLES } from './constants';
import { Article } from './types';
import { SettingsPage } from './components/SettingsPage';

function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [currentView, setCurrentView] = useState<'landing' | 'feed' | 'article' | 'storage' | 'profile' | 'stats' | 'drafts' | 'following' | 'person-profile' | 'editor' | 'settings'>('landing');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string>('');

  // Dropdown states
  const [isAvatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  // Check screen size to auto-close sidebar on mobile initially
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Apply theme to HTML element
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleArticleClick = (article: Article) => {
    setSelectedArticle(article);
    setCurrentView('article');
    // On mobile/tablet, close sidebar for focus
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const navigateHome = () => {
    setCurrentView('feed');
    setSelectedArticle(null);
  };

  const enterApp = () => {
    setCurrentView('feed');
  };

  const handleNavigation = (view: string) => {
    if (view === 'feed') navigateHome();
    else setCurrentView(view as any);
    
    // Auto close on mobile after navigation
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handlePersonClick = (name: string) => {
    setSelectedPerson(name);
    setCurrentView('person-profile');
  };

  // If on landing page, show separate layout
  if (currentView === 'landing') {
    return <LandingPage onEnter={enterApp} />;
  }

  // If on editor page, show distraction-free layout
  if (currentView === 'editor') {
    return <EditorPage onPublish={() => setCurrentView('feed')} onGoBack={() => setCurrentView('feed')} />;
  }

  const NotificationItem = ({ seed, user, action, time }: { seed: string, user: string, action: string, time: string }) => (
    <div className="px-4 py-4 border-b border-light-border dark:border-dark-border hover:bg-light-secondary dark:hover:bg-dark-secondary cursor-pointer flex gap-3 transition-colors">
       <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`} alt={user} />
       </div>
       <div>
          <div className="text-sm text-light-textMain dark:text-dark-textMain leading-snug">
              <span className="font-semibold">{user}</span> {action}
          </div>
          <div className="text-xs text-light-textSec dark:text-dark-textSec mt-1">{time}</div>
       </div>
    </div>
  );

  const AvatarMenuItem = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick?: () => void }) => (
    <div 
        className="px-5 py-2.5 text-sm text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain hover:bg-light-secondary dark:hover:bg-dark-secondary cursor-pointer flex items-center gap-3 transition-colors"
        onClick={onClick}
    >
        <Icon size={18} /> {label}
    </div>
  );

  // Main App Layout (Feed/Article/Storage/etc)
  return (
    <div className="min-h-screen bg-light-body dark:bg-dark-body font-sans transition-colors duration-300">
      
      {/* 1. Navbar */}
      <nav className="h-[57px] w-full border-b border-light-border dark:border-dark-border sticky top-0 bg-light-surface dark:bg-dark-surface z-50 blog-header">
        <div className="max-w-[1600px] mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Menu 
              className="cursor-pointer text-light-textMain dark:text-dark-textMain hover:text-light-accent transition-colors" 
              size={24} 
              strokeWidth={1.5}
              onClick={() => setSidebarOpen(!isSidebarOpen)} 
            />
            <div 
              className="font-logo text-[30px] text-light-textMain dark:text-dark-textMain pr-3 cursor-pointer select-none pt-1 hover:text-light-accent transition-colors"
              onClick={navigateHome}
            >
              Pythoughts
            </div>
            <div className="hidden md:flex items-center bg-light-secondary dark:bg-dark-secondary rounded-full px-4 py-2.5 gap-2.5 w-60 backdrop-blur-sm transition-colors focus-within:bg-gray-200 dark:focus-within:bg-gray-800">
              <Search size={18} className="text-light-textSec dark:text-dark-textSec" />
              <input 
                type="text" 
                placeholder="Search" 
                className="bg-transparent border-none outline-none text-sm w-full text-light-textMain dark:text-dark-textMain placeholder-light-textSec dark:placeholder-dark-textSec"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 text-light-textMain dark:text-dark-textMain">
            <button 
              onClick={toggleTheme} 
              className="hover:text-light-accent p-1 transition-colors"
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={22} strokeWidth={1.5} /> : <Sun size={22} strokeWidth={1.5} />}
            </button>
            
            <div 
              className="hidden sm:flex items-center gap-2 cursor-pointer hover:text-light-accent transition-colors"
              onClick={() => setCurrentView('editor')}
            >
              <Edit3 size={22} strokeWidth={1.5} /> <span className="text-[14px]">Write</span>
            </div>
            
            {/* Notification Bell */}
            <div className="relative">
                <Bell 
                    size={22} 
                    strokeWidth={1.5} 
                    className={`cursor-pointer transition-colors ${isNotificationsOpen ? 'text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                    onClick={() => {
                        setNotificationsOpen(!isNotificationsOpen);
                        setAvatarMenuOpen(false);
                    }}
                />
                {isNotificationsOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                        <div className="absolute right-[-80px] sm:right-0 mt-3 w-[360px] sm:w-[400px] bg-light-surface dark:bg-dark-surface rounded-lg shadow-xl border border-light-border dark:border-dark-border z-50 overflow-hidden animate-fade-in-up origin-top-right">
                            <div className="px-5 py-3 border-b border-light-border dark:border-dark-border flex justify-between items-center">
                                <h3 className="font-semibold text-lg text-light-textMain dark:text-dark-textMain">Notifications</h3>
                                <div className="flex gap-6 text-sm text-light-textSec dark:text-dark-textSec">
                                    <span className="text-light-textMain dark:text-dark-textMain font-medium cursor-pointer border-b-2 border-black dark:border-white pb-3 -mb-3.5">All</span>
                                    <span className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Responses</span>
                                </div>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                <NotificationItem seed="Burk" user="Burk" action="published 'The End of Personal Websites'" time="2 hours ago" />
                                <NotificationItem seed="Julia" user="Julia Serano" action="started following you" time="5 hours ago" />
                                <NotificationItem seed="Thomas" user="Thomas Ricouard" action="clapped for your story 'My Journey'" time="1 day ago" />
                                <NotificationItem seed="Catalyst" user="In Write A Catalyst" action="published 'n8n Just Got Insanely Powerful'" time="2 days ago" />
                            </div>
                            <div className="p-3 text-center text-sm text-[#1a8917] hover:text-[#156d12] cursor-pointer border-t border-light-border dark:border-dark-border">
                                See all notifications
                            </div>
                        </div>
                    </>
                )}
            </div>
            
            {/* Avatar Menu */}
            <div className="relative">
                <div 
                    className="w-8 h-8 rounded-full bg-cover cursor-pointer border border-gray-200 dark:border-gray-700 select-none ring-offset-2 hover:ring-2 ring-light-border dark:ring-dark-border transition-all" 
                    style={{backgroundImage: "url('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix')"}}
                    onClick={() => {
                        setAvatarMenuOpen(!isAvatarMenuOpen);
                        setNotificationsOpen(false);
                    }}
                ></div>

                {isAvatarMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setAvatarMenuOpen(false)} />
                        <div className="absolute right-0 mt-3 w-64 bg-light-surface dark:bg-dark-surface rounded-lg shadow-xl border border-light-border dark:border-dark-border z-50 overflow-hidden animate-fade-in-up origin-top-right">
                            <div className="px-5 py-4 border-b border-light-border dark:border-dark-border">
                                <div className="font-semibold text-light-textMain dark:text-dark-textMain truncate">Felix</div>
                                <div className="text-sm text-light-textSec dark:text-dark-textSec truncate">@felix_developer</div>
                            </div>
                            <div className="py-2">
                                <AvatarMenuItem icon={User} label="Profile" onClick={() => { setCurrentView('profile'); setAvatarMenuOpen(false); }} />
                                <AvatarMenuItem icon={Book} label="Storage" onClick={() => { setCurrentView('storage'); setAvatarMenuOpen(false); }} />
                                <AvatarMenuItem icon={FileText} label="Drafts" onClick={() => { setCurrentView('drafts'); setAvatarMenuOpen(false); }} />
                                <AvatarMenuItem icon={BarChart2} label="Stats" onClick={() => { setCurrentView('stats'); setAvatarMenuOpen(false); }} />
                            </div>
                            <div className="border-t border-light-border dark:border-dark-border py-2">
                                <AvatarMenuItem icon={Settings} label="Settings" onClick={() => { setCurrentView('settings'); setAvatarMenuOpen(false); }} />
                                <AvatarMenuItem icon={HelpCircle} label="Help" />
                            </div>
                            <div className="border-t border-light-border dark:border-dark-border py-2">
                                 <div className="px-5 py-2.5 text-sm text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain hover:bg-light-secondary dark:hover:bg-dark-secondary cursor-pointer flex items-center gap-3 transition-colors" onClick={() => setCurrentView('landing')}>
                                    <LogOut size={18} /> Sign out
                                 </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* 2. Main Layout Grid */}
      <div className={`flex justify-center transition-all duration-300 relative max-w-[1600px] mx-auto`}>
        
        {/* Mobile Backdrop Overlay - Increased z-index to 45 */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-45 md:hidden animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar */}
        <SidebarLeft isOpen={isSidebarOpen} onNavigate={handleNavigation} onPersonClick={handlePersonClick} activeView={currentView} />

        {/* Center Content */}
        <main className={`flex-1 min-w-0 bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border min-h-[calc(100vh-57px)] transition-all duration-300 pl-[2cm] md:pl-8`}>
          
          {currentView === 'feed' ? (
            <>
              {/* Feed Header Tabs */}
              <div className="sticky top-[57px] bg-light-surface dark:bg-dark-surface z-40 pt-10">
                <div className="max-w-[680px] w-full mx-auto px-6 md:px-0 flex gap-8 border-b border-light-border dark:border-dark-border">
                  <div className="pb-3.5 text-sm cursor-pointer border-b-2 border-light-textMain dark:border-dark-textMain font-medium text-light-textMain dark:text-dark-textMain">For you</div>
                  <div className="pb-3.5 text-sm cursor-pointer text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain hover:border-b-2 hover:border-light-border transition-all">Featured</div>
                </div>
              </div>

              {/* Feed List */}
              <div className="flex flex-col items-center">
                {MOCK_ARTICLES.map(article => (
                  <ArticleCard key={article.id} article={article} onClick={handleArticleClick} />
                ))}
              </div>
            </>
          ) : currentView === 'article' && selectedArticle ? (
            /* Article View */
             <ArticlePage article={selectedArticle} />
          ) : currentView === 'storage' ? (
            /* Storage View */
             <StoragePage />
          ) : currentView === 'profile' ? (
            /* Profile View */
             <ProfilePage articles={MOCK_ARTICLES} onArticleClick={handleArticleClick} />
          ) : currentView === 'stats' ? (
            /* Stats View */
             <StatsPage />
          ) : currentView === 'drafts' ? (
            /* Drafts View */
             <DraftsPage />
          ) : currentView === 'following' ? (
            /* Following View */
             <FollowingPage />
          ) : currentView === 'person-profile' ? (
             /* Person Profile View */
             <PersonProfilePage name={selectedPerson} />
          ) : currentView === 'settings' ? (
             /* Settings View */
             <SettingsPage />
          ) : null}
        </main>

        {/* Right Sidebar Logic */}
        {currentView === 'profile' ? (
            <SidebarRightProfile />
        ) : (currentView === 'feed' || currentView === 'storage' || currentView === 'stats' || currentView === 'following' || currentView === 'drafts' || currentView === 'person-profile') ? (
            <SidebarRight />
        ) : (
            selectedArticle && <SidebarRightArticle article={selectedArticle} />
        )}
      </div>
    </div>
  );
}

export default App;
