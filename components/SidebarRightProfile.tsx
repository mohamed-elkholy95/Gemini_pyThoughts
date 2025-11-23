
import React from 'react';
import { MoreHorizontal } from 'lucide-react';

export const SidebarRightProfile: React.FC = () => {
  const following = [
    { name: 'Python in Plain English', avatar: 'https://api.dicebear.com/7.x/icons/svg?seed=Python' },
    { name: 'Reza Rezvani', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Reza' },
    { name: 'Vignesh Selvaraj', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vignesh' },
    { name: 'Fady Othman', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fady' },
    { name: 'AI Software Engineer', avatar: 'https://api.dicebear.com/7.x/icons/svg?seed=AI' },
  ];

  return (
    <aside className="hidden xl:block w-[368px] p-[36px_40px] sticky top-[57px] h-screen overflow-y-auto scrollbar-hide bg-light-surface dark:bg-dark-surface border-l border-light-border dark:border-dark-border">
      
      {/* Profile Info */}
      <div className="mb-8">
        <img 
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" 
          alt="Profile" 
          className="w-[88px] h-[88px] rounded-full mb-5"
        />
        <h2 className="font-bold text-base text-light-textMain dark:text-dark-textMain mb-1">Felix</h2>
        <div className="text-sm text-[#1a8917] hover:text-[#156d12] cursor-pointer mb-4">Edit profile</div>
      </div>

      {/* Following List */}
      <div className="font-medium text-base mb-4 text-light-textMain dark:text-dark-textMain">Following</div>
      
      <div className="space-y-4 mb-6">
        {following.map((user, i) => (
          <div key={i} className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full" />
              <span className="text-[13px] text-light-textSec dark:text-dark-textSec group-hover:text-light-textMain dark:group-hover:text-dark-textMain truncate max-w-[180px]">
                {user.name}
              </span>
            </div>
            <MoreHorizontal size={16} className="text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain" />
          </div>
        ))}
      </div>

      <div className="text-[13px] text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer">
        See all (6)
      </div>

      {/* Footer Links */}
      <div className="mt-10 pt-6 border-t border-light-border dark:border-dark-border flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-light-textSec dark:text-dark-textSec">
          <span>Help</span>
          <span>Status</span>
          <span>About</span>
          <span>Careers</span>
          <span>Press</span>
          <span>Blog</span>
          <span>Privacy</span>
          <span>Terms</span>
          <span>Text to speech</span>
          <span>Teams</span>
      </div>
    </aside>
  );
};
