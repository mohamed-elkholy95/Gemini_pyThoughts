
import React from 'react';
import { Home, PieChart, Database, User, Settings, Search, Plus, Book, FileText, BarChart2 } from 'lucide-react';

interface SidebarLeftProps {
  isOpen: boolean;
  onNavigate: (view: string) => void;
  onPersonClick: (name: string) => void;
  activeView: string;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({ isOpen, onNavigate, onPersonClick, activeView }) => {
  const sidebarClasses = `
    sticky top-[57px] h-[calc(100vh-57px)]
    flex flex-col border-r border-light-border dark:border-dark-border
    bg-light-surface dark:bg-dark-surface
    overflow-y-auto overflow-x-hidden whitespace-nowrap
    transition-all duration-300 ease-in-out z-50
    ${isOpen ? 'w-[240px] p-[30px_20px] opacity-100 translate-x-0 shadow-2xl md:shadow-none' : 'w-0 p-0 opacity-0 -translate-x-full'}
  `;

  return (
    <aside className={sidebarClasses}>
      <div 
        onClick={() => onNavigate('feed')}
        className={`flex items-center gap-4 py-2.5 mb-2 cursor-pointer text-[15px] ${activeView === 'feed' ? 'font-semibold text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
      >
        <Home size={20} className="w-6 text-center" /> Home
      </div>

      <div 
        onClick={() => onNavigate('storage')}
        className={`flex items-center gap-4 py-2.5 mb-2 cursor-pointer text-[15px] ${activeView === 'storage' ? 'font-semibold text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
      >
        <Book size={20} className="w-6 text-center" /> Storage
      </div>
      <div 
        onClick={() => onNavigate('profile')}
        className={`flex items-center gap-4 py-2.5 mb-2 cursor-pointer text-[15px] ${activeView === 'profile' ? 'font-semibold text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
      >
        <User size={20} className="w-6 text-center" /> Profile
      </div>
      <div 
        onClick={() => onNavigate('drafts')}
        className={`flex items-center gap-4 py-2.5 mb-2 cursor-pointer text-[15px] ${activeView === 'drafts' ? 'font-semibold text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
      >
        <FileText size={20} className="w-6 text-center" /> Drafts
      </div>
      <div 
        onClick={() => onNavigate('stats')}
        className={`flex items-center gap-4 py-2.5 mb-2 cursor-pointer text-[15px] ${activeView === 'stats' ? 'font-semibold text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
      >
        <BarChart2 size={20} className="w-6 text-center" /> Stats
      </div>

      <div className="h-px bg-light-border dark:bg-dark-border my-5" />

      <div 
        className={`text-base font-semibold mb-4 cursor-pointer hover:text-light-textMain dark:text-dark-textMain ${activeView === 'following' ? 'text-light-textMain dark:text-dark-textMain' : 'text-light-textSec dark:text-dark-textSec'}`}
        onClick={() => onNavigate('following')}
      >
        Following
      </div>

      <FollowingItem name="Vignesh Selvaraj" seed="Vignesh" onClick={() => onPersonClick('Vignesh Selvaraj')} />
      <FollowingItem name="Level Up Coding" seed="Level" isIcon onClick={() => onPersonClick('Level Up Coding')} />
      <FollowingItem name="Reza Rezvani" seed="Reza" onClick={() => onPersonClick('Reza Rezvani')} />
      <FollowingItem name="AI Software Engi..." seed="AI" isIcon onClick={() => onPersonClick('AI Software Engineer')} />
      <FollowingItem name="Ashley Ha" seed="Ashley" onClick={() => onPersonClick('Ashley Ha')} />

      <div className="flex items-center gap-4 py-2.5 mt-5 cursor-pointer text-[15px] text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain">
        <Plus size={20} className="w-6 text-center" /> Find writers and...
      </div>

      <div className="mt-5 text-[13px] text-light-textSec dark:text-dark-textSec underline cursor-pointer">
        See suggestions
      </div>
    </aside>
  );
};

const FollowingItem = ({ name, seed, isIcon, onClick }: { name: string, seed: string, isIcon?: boolean, onClick: () => void }) => (
  <div 
    onClick={onClick}
    className="flex items-center gap-3 mb-4 text-sm text-light-textSec dark:text-dark-textSec cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain"
  >
    <img 
        src={`https://api.dicebear.com/7.x/${isIcon ? 'icons' : 'avataaars'}/svg?seed=${seed}`} 
        className={`w-5 h-5 ${isIcon ? 'rounded' : 'rounded-full'}`} 
        alt={name}
    />
    <span className="truncate">{name}</span>
    {Math.random() > 0.5 && <div className="w-1.5 h-1.5 bg-green-600 rounded-full ml-auto" />}
  </div>
);
