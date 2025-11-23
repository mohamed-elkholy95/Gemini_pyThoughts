
import React, { useState } from 'react';
import { ChevronRight, CheckSquare, Square } from 'lucide-react';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('Account');

  return (
    <div className="w-full flex justify-center min-h-screen bg-white dark:bg-dark-body text-light-textMain dark:text-dark-textMain">
      <div className="max-w-[728px] w-full px-6 pt-12 pb-20">
        
        <h1 className="font-serif font-bold text-4xl mb-10">Settings</h1>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-10 overflow-x-auto scrollbar-hide">
            {['Account', 'Publishing', 'Notifications', 'Membership and payment', 'Security and apps'].map((tab) => (
                <div 
                    key={tab} 
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 whitespace-nowrap text-sm cursor-pointer transition-colors ${activeTab === tab 
                        ? 'border-b-2 border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain font-medium' 
                        : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                >
                    {tab}
                </div>
            ))}
        </div>

        {/* Content */}
        <div className="animate-fade-in-up">
            {activeTab === 'Account' && <AccountSettings />}
            {activeTab === 'Publishing' && <PublishingSettings />}
            {activeTab === 'Notifications' && <NotificationSettings />}
            {(activeTab === 'Membership and payment' || activeTab === 'Security and apps') && (
                <div className="py-20 text-center text-light-textSec dark:text-dark-textSec">
                    Settings for {activeTab} are coming soon.
                </div>
            )}
        </div>

      </div>
      
      {/* Right Help Sidebar (Desktop only) */}
      <div className="hidden xl:block w-[368px] p-10 border-l border-light-border dark:border-dark-border">
         <h3 className="font-bold text-sm mb-4">Suggested help articles</h3>
         <div className="space-y-4 text-sm text-light-textSec dark:text-dark-textSec">
             <div className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Sign in or sign up to Medium</div>
             <div className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Your profile page</div>
             <div className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Writing and publishing your first story</div>
             <div className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">About Medium's distribution system</div>
             <div className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Get started with the Partner Program</div>
         </div>
      </div>
    </div>
  );
};

/* --- Account Tab --- */
const AccountSettings = () => (
    <div className="space-y-8">
        <SettingItem 
            label="Email address" 
            value="moelkholy1995@gmail.com" 
        />
        <SettingItem 
            label="Username and subdomain" 
            value="@moelkholy1995" 
        />
        <div className="flex justify-between items-start py-2 group cursor-pointer">
            <div>
                <div className="text-sm font-medium mb-1">Profile information</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Edit your photo, name, pronouns, short bio, etc.</div>
            </div>
            <div className="flex items-center gap-3">
                 <span className="text-sm text-light-textSec dark:text-dark-textSec">Mohamed Elkholy</span>
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" className="w-8 h-8 rounded-full" alt="User" />
            </div>
        </div>
        <SettingItem label="Profile design" subtext="Customize the appearance of your profile" hasArrow />
        <SettingItem label="Custom domain" subtext="Redirect your profile URL to a domain like yourdomain.com" value="None" hasArrow />
        <SettingItem label="Partner Program" subtext="You are not enrolled in the Partner Program" hasArrow />
        
        <div className="pt-4 pb-2">
            <div className="flex justify-between items-center mb-1">
                <div className="text-sm font-medium">Your Medium Digest frequency</div>
                <div className="text-sm text-[#1a8917] cursor-pointer flex items-center gap-1">Daily <ChevronRight size={16} /></div>
            </div>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Adjust how often you see a new Digest.</div>
        </div>

        <div className="flex justify-between items-start py-2">
            <div>
                 <div className="text-sm font-medium mb-1">Provide Feedback</div>
                 <div className="text-sm text-light-textSec dark:text-dark-textSec mb-2">Receive occasional invitations to share your feedback with Medium.</div>
                 <div className="text-sm text-light-textSec dark:text-dark-textSec underline cursor-pointer">Share feedback now</div>
            </div>
            <div className="text-[#1a8917]"><CheckSquare size={20} fill="currentColor" className="text-white" /></div>
        </div>

        <div className="h-px bg-light-border dark:bg-dark-border my-6" />

        <SettingItem label="Refine recommendations" subtext="Adjust recommendations by updating what you're following and more" hasArrow />
        <SettingItem label="Muted writers and publications" hasArrow />
        <SettingItem label="Blocked users" hasArrow />

        <div className="h-px bg-light-border dark:bg-dark-border my-6" />

        <div className="py-2">
            <div className="text-sm font-medium text-red-600 mb-1 cursor-pointer hover:text-red-700">Deactivate account</div>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Deactivating will suspend your account until you sign back in.</div>
        </div>
        <div className="py-2">
            <div className="text-sm font-medium text-red-600 mb-1 cursor-pointer hover:text-red-700">Delete account</div>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Permanently delete your account and all of your content.</div>
        </div>
    </div>
);

/* --- Publishing Tab --- */
const PublishingSettings = () => (
    <div className="space-y-10">
        <div className="text-sm font-medium cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">Manage publications</div>

        <div>
            <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-medium">Allow readers to leave private notes on your stories</div>
                <div className="text-[#1a8917]"><CheckSquare size={20} fill="currentColor" className="text-white" /></div>
            </div>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Private notes are visible to you and (if left in a publication) all Editors of the publication.</div>
        </div>

        <div className="flex justify-between items-center">
            <div>
                <div className="text-sm font-medium mb-1">Manage tipping on your stories</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Readers can send you tips through the third-party platform of your choice.</div>
            </div>
            <div className="text-sm text-light-textSec dark:text-dark-textSec">Disabled</div>
        </div>

        <div className="h-px bg-light-border dark:bg-dark-border" />

        <div className="flex justify-between items-start">
             <div>
                <div className="text-sm font-medium mb-1">Allow email replies</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Let readers reply to your stories directly from their email.</div>
             </div>
             <Square size={20} className="text-light-textSec dark:text-dark-textSec" />
        </div>

        <div className="flex justify-between items-start">
             <div>
                <div className="text-sm font-medium mb-1">'Reply To' email address</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Shown to your subscribers when they reply.</div>
             </div>
             <div className="text-sm text-light-textSec dark:text-dark-textSec">moelkholy1995@gmail.com</div>
        </div>

        <SettingItem label="Import email subscribers" subtext="Upload a CSV or TXT file containing up to 25,000 email addresses." hasArrow />

        <div className="h-px bg-light-border dark:bg-dark-border" />

        <div>
            <div className="text-sm font-medium mb-4">Promote email subscriptions</div>
            <div className="bg-light-secondary dark:bg-dark-secondary/30 p-4 rounded text-sm text-light-textSec dark:text-dark-textSec">
                We've simplified things. These options are no longer available, as your readers can now opt in for email notifications more easily from your story page. <span className="underline cursor-pointer">Read more here</span>
            </div>
        </div>
    </div>
);

/* --- Notification Settings --- */
const NotificationSettings = () => (
    <div className="space-y-12">
        <SectionHeader title="Email notifications" />
        
        <div className="space-y-6">
            <div className="text-sm font-bold border-b border-light-border dark:border-dark-border pb-2">Story recommendations</div>
            <CheckboxItem 
                label="New Medium Digest" 
                subtext="The best stories on Medium personalized based on your interests, as well as outstanding stories selected by our editors." 
                checked 
            />
            <CheckboxItem 
                label="Recommended reading" 
                subtext="Featured stories, columns, and collections that we think you'll enjoy based on your reading history." 
                checked 
            />
        </div>

        <div className="space-y-6">
            <div className="text-sm font-bold border-b border-light-border dark:border-dark-border pb-2">From writers and publications</div>
            <CheckboxItem 
                label="New stories added to lists you've saved" 
                checked 
            />
             <div className="flex justify-between items-center py-2">
                <div className="text-sm">Manage email notifications</div>
                <div className="flex items-center gap-2 text-sm text-light-textSec dark:text-dark-textSec">
                    Reza Rezvani, Ashley Ha
                    <div className="flex -space-x-2">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Reza" className="w-6 h-6 rounded-full border border-white" />
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Ashley" className="w-6 h-6 rounded-full border border-white" />
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-6">
             <div className="text-sm font-bold border-b border-light-border dark:border-dark-border pb-2">Social activity</div>
             <CheckboxItem label="Follows and matching highlights" checked />
             <CheckboxItem label="Replies to your responses" checked />
             <div className="flex justify-between items-center py-1">
                <div className="text-sm">Story mentions</div>
                <div className="text-sm text-[#1a8917] cursor-pointer">In network <ChevronDownIcon /></div>
             </div>
        </div>

        <div className="space-y-6">
             <SectionHeader title="Push notifications" />
             <div className="text-sm text-light-textSec dark:text-dark-textSec">
                 Open the Medium app from your mobile device to make changes to push notifications.
             </div>
        </div>
    </div>
);


/* Helper Components */
const SettingItem = ({ label, subtext, value, hasArrow }: { label: string, subtext?: string, value?: string, hasArrow?: boolean }) => (
    <div className="flex justify-between items-start py-1 cursor-pointer group">
        <div>
            <div className="text-sm font-medium mb-1 group-hover:text-black dark:group-hover:text-white">{label}</div>
            {subtext && <div className="text-sm text-light-textSec dark:text-dark-textSec">{subtext}</div>}
        </div>
        <div className="flex items-center gap-2">
            {value && <div className="text-sm text-light-textSec dark:text-dark-textSec">{value}</div>}
            {hasArrow && <ChevronRight size={18} className="text-light-textSec dark:text-dark-textSec" />}
        </div>
    </div>
);

const CheckboxItem = ({ label, subtext, checked }: { label: string, subtext?: string, checked?: boolean }) => (
    <div className="flex justify-between items-start">
        <div className="pr-8">
            <div className="text-sm font-medium mb-1">{label}</div>
            {subtext && <div className="text-sm text-light-textSec dark:text-dark-textSec leading-relaxed">{subtext}</div>}
        </div>
        <div className={checked ? "text-[#1a8917]" : "text-light-textSec"}>
            {checked ? <CheckSquare size={20} fill="currentColor" className="text-white" /> : <Square size={20} />}
        </div>
    </div>
);

const SectionHeader = ({ title }: { title: string }) => (
    <h2 className="font-bold text-2xl mb-6 border-b border-light-border dark:border-dark-border pb-4">{title}</h2>
);

const ChevronDownIcon = () => (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="inline ml-1" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
