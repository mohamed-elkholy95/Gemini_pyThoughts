
import React, { useState } from 'react';
import { User, Bell, Lock, Mail, CreditCard, Shield, ChevronRight } from 'lucide-react';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('Account');

  const tabs = [
    { name: 'Account', href: '#' },
    { name: 'Publishing', href: '#' },
    { name: 'Notifications', href: '#' },
    { name: 'Membership and payment', href: '#' },
    { name: 'Security and apps', href: '#' },
  ];

  return (
    <div className="w-full flex justify-center min-h-screen bg-white dark:bg-dark-body text-light-textMain dark:text-dark-textMain">
      <div className="max-w-[1000px] w-full px-6 pt-12 pb-20">
        
        <h1 className="font-serif font-bold text-4xl mb-10">Settings</h1>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-10 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
                <div 
                    key={tab.name} 
                    onClick={() => setActiveTab(tab.name)}
                    className={`pb-3 whitespace-nowrap text-sm cursor-pointer transition-colors ${activeTab === tab.name 
                        ? 'border-b border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain font-medium' 
                        : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                >
                    {tab.name}
                </div>
            ))}
        </div>

        {/* Content */}
        <div className="max-w-[700px]">
            {activeTab === 'Account' && <AccountSettings />}
            {activeTab === 'Publishing' && <PublishingSettings />}
            {activeTab === 'Notifications' && <NotificationSettings />}
            {(activeTab === 'Membership and payment' || activeTab === 'Security and apps') && (
                <div className="py-10 text-center text-light-textSec dark:text-dark-textSec">
                    Settings for {activeTab} are coming soon.
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

const AccountSettings = () => (
    <div className="space-y-8">
        <h3 className="text-2xl font-bold mb-6 text-[#1a8917]">Account</h3>
        
        <SettingRow label="Email address" value="moelkholy1995@gmail.com" />
        <SettingRow label="Username and subdomain" value="@moelkholy1995" />
        
        <div className="flex justify-between items-start py-4">
            <div>
                <div className="font-medium mb-1">Profile information</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Edit your photo, name, pronouns, short bio, etc.</div>
            </div>
            <div className="flex items-center gap-2">
                 <span className="text-sm text-light-textSec dark:text-dark-textSec">Mohamed Elkholy</span>
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" className="w-8 h-8 rounded-full" alt="Profile" />
            </div>
        </div>

        <SettingRow label="Profile design" subtext="Customize the appearance of your profile" hasArrow />
        <SettingRow label="Custom domain" subtext="Redirect your profile URL to a domain like yourdomain.com" value="None" hasArrow />
        <SettingRow label="Partner Program" subtext="You are not enrolled in the Partner Program" hasArrow />
        
        <div className="flex justify-between items-center py-4">
             <div>
                <div className="font-medium mb-1">Your Medium Digest frequency</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Adjust how often you see a new Digest.</div>
             </div>
             <div className="text-sm text-[#1a8917] font-medium flex items-center gap-1 cursor-pointer">
                 Daily <ChevronRight size={16} />
             </div>
        </div>

        <div className="flex justify-between items-center py-4">
             <div>
                <div className="font-medium mb-1">Provide Feedback</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec max-w-sm">
                    Receive occasional invitations to share your feedback with Medium. <span className="underline cursor-pointer">Share feedback now</span>
                </div>
             </div>
             <div className="w-5 h-5 bg-[#1a8917] rounded text-white flex items-center justify-center text-xs">✓</div>
        </div>

        <SettingRow label="Refine recommendations" subtext="Adjust recommendations by updating what you're following and more" hasArrow />
        <SettingRow label="Muted writers and publications" hasArrow />
        <SettingRow label="Blocked users" hasArrow />

        <div className="pt-8 mt-8 border-t border-light-border dark:border-dark-border space-y-6">
            <div>
                <div className="text-red-600 dark:text-red-400 font-medium cursor-pointer hover:text-red-700">Deactivate account</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec mt-1">Deactivating will suspend your account until you sign back in.</div>
            </div>
            <div>
                <div className="text-red-600 dark:text-red-400 font-medium cursor-pointer hover:text-red-700">Delete account</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec mt-1">Permanently delete your account and all of your content.</div>
            </div>
        </div>
    </div>
);

const PublishingSettings = () => (
    <div className="space-y-8">
        <h3 className="text-2xl font-bold mb-6 text-[#1a8917]">Publishing</h3>
        
        <div className="py-2 cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Manage publications</div>

        <div className="flex justify-between items-center py-4">
             <div>
                <div className="font-medium mb-1">Allow readers to leave private notes on your stories</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Private notes are visible to you and (if left in a publication) all Editors of the publication.</div>
             </div>
             <div className="w-5 h-5 bg-[#1a8917] rounded text-white flex items-center justify-center text-xs">✓</div>
        </div>

        <div className="flex justify-between items-center py-4">
             <div>
                <div className="font-medium mb-1">Manage tipping on your stories</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Readers can send you tips through the third-party platform of your choice.</div>
             </div>
             <div className="text-sm text-light-textSec dark:text-dark-textSec">Disabled</div>
        </div>

        <div className="flex justify-between items-center py-4">
             <div>
                <div className="font-medium mb-1">Allow email replies</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Let readers reply to your stories directly from their email.</div>
             </div>
             <div className="w-5 h-5 border border-light-textSec dark:border-dark-textSec rounded"></div>
        </div>

        <SettingRow label="'Reply To' email address" subtext="Shown to your subscribers when they reply." value="moelkholy1995@gmail.com" />
        
        <SettingRow label="Import email subscribers" subtext="Upload a CSV or TXT file containing up to 25,000 email addresses." hasArrow />

        <div className="p-4 bg-light-secondary dark:bg-dark-secondary rounded-lg border border-light-border dark:border-dark-border text-sm">
            <strong>We've simplified things.</strong> These options are no longer available, as your readers can now opt in for email notifications more easily from your story page. <span className="underline cursor-pointer">Read more here</span>
        </div>
    </div>
);

const NotificationSettings = () => (
    <div className="space-y-10">
        <div>
            <h3 className="text-2xl font-bold mb-6">Email notifications</h3>
            
            <h4 className="font-bold mb-4">Story recommendations</h4>
            <SettingToggle label="New Medium Digest" subtext="The best stories on Medium personalized based on your interests, as well as outstanding stories selected by our editors." checked />
            <SettingToggle label="Recommended reading" subtext="Featured stories, columns, and collections that we think you'll enjoy based on your reading history." checked />
        </div>

        <div>
            <h4 className="font-bold mb-4">From writers and publications</h4>
            <SettingToggle label="New stories added to lists you've saved" checked />
            <div className="flex justify-between items-center py-3">
                 <div className="text-sm">Manage email notifications</div>
                 <div className="flex items-center gap-2">
                     <span className="text-xs text-light-textSec dark:text-dark-textSec">Reza Rezvani, Ashley Ha</span>
                     <div className="flex -space-x-2">
                         <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Reza" className="w-6 h-6 rounded-full border border-white" alt="1"/>
                         <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Ashley" className="w-6 h-6 rounded-full border border-white" alt="2"/>
                     </div>
                 </div>
            </div>
        </div>

        <div>
             <h4 className="font-bold mb-4">Social activity</h4>
             <SettingToggle label="Follows and matching highlights" checked />
             <SettingToggle label="Replies to your responses" checked />
             <div className="flex justify-between items-center py-3">
                 <div className="text-sm">Story mentions</div>
                 <div className="text-sm text-[#1a8917] flex items-center gap-1">In network <ChevronDownIcon /></div>
             </div>
        </div>
        
        <div>
            <h3 className="text-2xl font-bold mb-6">Push notifications</h3>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Open the Medium app from your mobile device to make changes to push notifications.</div>
        </div>
    </div>
);

const SettingRow = ({ label, subtext, value, hasArrow }: { label: string, subtext?: string, value?: string, hasArrow?: boolean }) => (
    <div className="flex justify-between items-start py-4 cursor-pointer group">
        <div>
            <div className="font-medium mb-1 group-hover:text-[#1a8917] transition-colors">{label}</div>
            {subtext && <div className="text-sm text-light-textSec dark:text-dark-textSec max-w-lg">{subtext}</div>}
        </div>
        <div className="flex items-center gap-2">
            {value && <span className="text-sm text-light-textSec dark:text-dark-textSec">{value}</span>}
            {hasArrow && <ChevronRight size={18} className="text-light-textSec dark:text-dark-textSec" />}
        </div>
    </div>
);

const SettingToggle = ({ label, subtext, checked }: { label: string, subtext?: string, checked?: boolean }) => (
    <div className="flex justify-between items-start py-4">
         <div>
            <div className="text-sm font-medium mb-1">{label}</div>
            {subtext && <div className="text-xs text-light-textSec dark:text-dark-textSec max-w-lg leading-relaxed">{subtext}</div>}
         </div>
         <div className={`w-5 h-5 rounded flex items-center justify-center text-xs ${checked ? 'bg-[#1a8917] text-white' : 'border border-gray-400'}`}>
             {checked && '✓'}
         </div>
    </div>
);

const ChevronDownIcon = () => (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
