import React from 'react';

export interface Author {
  name: string;
  avatar: string;
  isPro?: boolean;
  bio?: string;
  followers?: string;
}

export interface Publication {
  name: string;
  logo: string;
  description: string;
}

export interface TableOfContentsItem {
  id: string;
  text: string;
  level: number;
}

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  author: Author;
  publication?: Publication;
  thumbnail: string;
  date: string;
  readTime?: string;
  likes: string;
  comments: number;
  tags?: string[];
  content?: string; // HTML content for the mock view
  toc?: TableOfContentsItem[];
}

export interface NavItem {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  link?: string;
}

export interface StaffPick {
  author: Author;
  title: string;
  date: string;
}

export interface Topic {
  name: string;
  link: string;
}