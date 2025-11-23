import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { logger } from '../config/logger.js';

// Email configuration from environment
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@pythoughts.com';
const APP_NAME = 'Pythoughts';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Create transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Email templates
const templates = {
  welcome: Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
        .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{appName}}</h1>
        </div>
        <div class="content">
          <h2>Welcome, {{name}}!</h2>
          <p>Thank you for joining {{appName}}. We're excited to have you as part of our community of writers and readers.</p>
          <p>Start exploring and sharing your thoughts with the world:</p>
          <p style="text-align: center; padding: 20px 0;">
            <a href="{{appUrl}}/new" class="button">Write Your First Article</a>
          </p>
        </div>
        <div class="footer">
          <p>© {{year}} {{appName}}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `),

  passwordReset: Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
        .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; border-top: 1px solid #eee; }
        .warning { background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{appName}}</h1>
        </div>
        <div class="content">
          <h2>Password Reset Request</h2>
          <p>Hi {{name}},</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <p style="text-align: center; padding: 20px 0;">
            <a href="{{resetUrl}}" class="button">Reset Password</a>
          </p>
          <div class="warning">
            <strong>Note:</strong> This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </div>
        </div>
        <div class="footer">
          <p>© {{year}} {{appName}}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `),

  newFollower: Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .avatar { width: 60px; height: 60px; border-radius: 50%; }
        .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
        .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{appName}}</h1>
        </div>
        <div class="content">
          <h2>You have a new follower!</h2>
          <p>Hi {{recipientName}},</p>
          <p><strong>{{followerName}}</strong> started following you on {{appName}}.</p>
          <p style="text-align: center; padding: 20px 0;">
            <a href="{{profileUrl}}" class="button">View Profile</a>
          </p>
        </div>
        <div class="footer">
          <p>© {{year}} {{appName}}. All rights reserved.</p>
          <p><a href="{{unsubscribeUrl}}">Unsubscribe from these emails</a></p>
        </div>
      </div>
    </body>
    </html>
  `),

  newComment: Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .comment-box { background: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
        .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{appName}}</h1>
        </div>
        <div class="content">
          <h2>New comment on your article</h2>
          <p>Hi {{recipientName}},</p>
          <p><strong>{{commenterName}}</strong> commented on "{{articleTitle}}":</p>
          <div class="comment-box">
            <p>{{commentPreview}}</p>
          </div>
          <p style="text-align: center; padding: 20px 0;">
            <a href="{{articleUrl}}" class="button">View Comment</a>
          </p>
        </div>
        <div class="footer">
          <p>© {{year}} {{appName}}. All rights reserved.</p>
          <p><a href="{{unsubscribeUrl}}">Unsubscribe from these emails</a></p>
        </div>
      </div>
    </body>
    </html>
  `),

  articlePublished: Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .article-card { border: 1px solid #eee; border-radius: 8px; overflow: hidden; margin: 20px 0; }
        .article-image { width: 100%; height: 200px; object-fit: cover; }
        .article-body { padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
        .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{appName}}</h1>
        </div>
        <div class="content">
          <h2>New article from {{authorName}}</h2>
          <p>{{authorName}}, whom you follow, just published a new article:</p>
          <div class="article-card">
            {{#if coverImage}}<img src="{{coverImage}}" class="article-image" alt="">{{/if}}
            <div class="article-body">
              <h3>{{articleTitle}}</h3>
              <p>{{articleExcerpt}}</p>
              <p><a href="{{articleUrl}}" class="button">Read Article</a></p>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>© {{year}} {{appName}}. All rights reserved.</p>
          <p><a href="{{unsubscribeUrl}}">Unsubscribe from these emails</a></p>
        </div>
      </div>
    </body>
    </html>
  `),
};

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const emailService = {
  // Send email
  async send(options: SendEmailOptions): Promise<boolean> {
    // Skip if SMTP not configured
    if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
      logger.warn('SMTP not configured, skipping email');
      return false;
    }

    try {
      await transporter.sendMail({
        from: `"${APP_NAME}" <${FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      });

      logger.info({ to: options.to, subject: options.subject }, 'Email sent');
      return true;
    } catch (error) {
      logger.error({ error, to: options.to }, 'Failed to send email');
      return false;
    }
  },

  // Send welcome email
  async sendWelcome(to: string, name: string) {
    const html = templates.welcome({
      appName: APP_NAME,
      appUrl: APP_URL,
      name,
      year: new Date().getFullYear(),
    });

    return this.send({
      to,
      subject: `Welcome to ${APP_NAME}!`,
      html,
    });
  },

  // Send password reset email
  async sendPasswordReset(to: string, name: string, resetToken: string) {
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
    const html = templates.passwordReset({
      appName: APP_NAME,
      name,
      resetUrl,
      year: new Date().getFullYear(),
    });

    return this.send({
      to,
      subject: `Reset your ${APP_NAME} password`,
      html,
    });
  },

  // Send new follower notification
  async sendNewFollower(to: string, recipientName: string, followerName: string, followerId: string) {
    const html = templates.newFollower({
      appName: APP_NAME,
      recipientName,
      followerName,
      profileUrl: `${APP_URL}/profile/${followerId}`,
      unsubscribeUrl: `${APP_URL}/settings/notifications`,
      year: new Date().getFullYear(),
    });

    return this.send({
      to,
      subject: `${followerName} started following you on ${APP_NAME}`,
      html,
    });
  },

  // Send new comment notification
  async sendNewComment(
    to: string,
    recipientName: string,
    commenterName: string,
    articleTitle: string,
    articleId: string,
    commentPreview: string
  ) {
    const html = templates.newComment({
      appName: APP_NAME,
      recipientName,
      commenterName,
      articleTitle,
      articleUrl: `${APP_URL}/article/${articleId}`,
      commentPreview: commentPreview.slice(0, 200) + (commentPreview.length > 200 ? '...' : ''),
      unsubscribeUrl: `${APP_URL}/settings/notifications`,
      year: new Date().getFullYear(),
    });

    return this.send({
      to,
      subject: `${commenterName} commented on your article`,
      html,
    });
  },

  // Send article published notification (to followers)
  async sendArticlePublished(
    to: string,
    authorName: string,
    articleTitle: string,
    articleExcerpt: string,
    articleId: string,
    coverImage?: string
  ) {
    const html = templates.articlePublished({
      appName: APP_NAME,
      authorName,
      articleTitle,
      articleExcerpt: articleExcerpt?.slice(0, 200) + (articleExcerpt?.length > 200 ? '...' : ''),
      articleUrl: `${APP_URL}/article/${articleId}`,
      coverImage,
      unsubscribeUrl: `${APP_URL}/settings/notifications`,
      year: new Date().getFullYear(),
    });

    return this.send({
      to,
      subject: `New article from ${authorName}: ${articleTitle}`,
      html,
    });
  },

  // Verify SMTP connection
  async verifyConnection(): Promise<boolean> {
    if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
      return false;
    }

    try {
      await transporter.verify();
      logger.info('SMTP connection verified');
      return true;
    } catch (error) {
      logger.error({ error }, 'SMTP connection failed');
      return false;
    }
  },
};
