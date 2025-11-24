// Permissions & Roles Service
// Fine-grained access control for team collaboration

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService } from './cache.service.js';

// Role definitions
export type Role = 'owner' | 'admin' | 'editor' | 'author' | 'contributor' | 'viewer';

// Resource types
export type ResourceType = 'draft' | 'series' | 'readingList' | 'team' | 'settings' | 'analytics' | 'newsletter';

// Permission types
export type Permission =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'manage_team'
  | 'manage_settings'
  | 'view_analytics'
  | 'manage_newsletter'
  | 'moderate'
  | 'export';

// Role-Permission mapping
const ROLE_PERMISSIONS: Record<Role, Record<ResourceType, Permission[]>> = {
  owner: {
    draft: ['create', 'read', 'update', 'delete', 'publish', 'unpublish'],
    series: ['create', 'read', 'update', 'delete', 'publish'],
    readingList: ['create', 'read', 'update', 'delete'],
    team: ['create', 'read', 'update', 'delete', 'manage_team'],
    settings: ['read', 'update', 'manage_settings'],
    analytics: ['read', 'view_analytics', 'export'],
    newsletter: ['create', 'read', 'update', 'delete', 'manage_newsletter'],
  },
  admin: {
    draft: ['create', 'read', 'update', 'delete', 'publish', 'unpublish'],
    series: ['create', 'read', 'update', 'delete', 'publish'],
    readingList: ['create', 'read', 'update', 'delete'],
    team: ['read', 'update', 'manage_team'],
    settings: ['read', 'update'],
    analytics: ['read', 'view_analytics', 'export'],
    newsletter: ['create', 'read', 'update', 'delete', 'manage_newsletter'],
  },
  editor: {
    draft: ['create', 'read', 'update', 'publish', 'unpublish'],
    series: ['create', 'read', 'update'],
    readingList: ['create', 'read', 'update'],
    team: ['read'],
    settings: ['read'],
    analytics: ['read', 'view_analytics'],
    newsletter: ['create', 'read', 'update'],
  },
  author: {
    draft: ['create', 'read', 'update'],
    series: ['create', 'read'],
    readingList: ['create', 'read', 'update'],
    team: ['read'],
    settings: [],
    analytics: ['read'],
    newsletter: ['read'],
  },
  contributor: {
    draft: ['create', 'read'],
    series: ['read'],
    readingList: ['read'],
    team: ['read'],
    settings: [],
    analytics: [],
    newsletter: ['read'],
  },
  viewer: {
    draft: ['read'],
    series: ['read'],
    readingList: ['read'],
    team: ['read'],
    settings: [],
    analytics: [],
    newsletter: [],
  },
};

// Team member interface
interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: Role;
  permissions: Permission[];
  invitedBy: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  status: 'pending' | 'active' | 'suspended';
}

// Team interface
interface Team {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  settings: {
    allowPublicJoin: boolean;
    defaultRole: Role;
    requireApproval: boolean;
  };
}

// Resource permission override
interface PermissionOverride {
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
  permissions: Permission[];
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date | null;
}

// In-memory storage (would be database tables in production)
const teams = new Map<string, Team>();
const teamMembers = new Map<string, TeamMember[]>();
const permissionOverrides = new Map<string, PermissionOverride[]>();

export const permissionsService = {
  // ============ Role Management ============

  // Get permissions for a role
  getRolePermissions(role: Role): Record<ResourceType, Permission[]> {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
  },

  // Get all roles
  getAllRoles(): Role[] {
    return ['owner', 'admin', 'editor', 'author', 'contributor', 'viewer'];
  },

  // Check if role A is higher than role B
  isRoleHigherOrEqual(roleA: Role, roleB: Role): boolean {
    const roleOrder: Role[] = ['viewer', 'contributor', 'author', 'editor', 'admin', 'owner'];
    return roleOrder.indexOf(roleA) >= roleOrder.indexOf(roleB);
  },

  // ============ Permission Checking ============

  // Check if user has permission on resource
  async hasPermission(
    userId: string,
    resourceType: ResourceType,
    permission: Permission,
    resourceId?: string
  ): Promise<boolean> {
    const cacheKey = `perm:${userId}:${resourceType}:${permission}:${resourceId || 'global'}`;
    const cached = await cacheService.get<boolean>(cacheKey);
    if (cached !== null) return cached;

    // Check permission overrides first
    if (resourceId) {
      const overrides = permissionOverrides.get(userId) || [];
      const override = overrides.find(
        (o) => o.resourceType === resourceType && o.resourceId === resourceId
      );

      if (override) {
        // Check if expired
        if (!override.expiresAt || override.expiresAt > new Date()) {
          const hasPermission = override.permissions.includes(permission);
          await cacheService.set(cacheKey, hasPermission, 300);
          return hasPermission;
        }
      }
    }

    // Check team membership
    const userTeams = await this.getUserTeams(userId);

    for (const team of userTeams) {
      const member = (teamMembers.get(team.id) || []).find((m) => m.userId === userId);
      if (member && member.status === 'active') {
        const rolePerms = ROLE_PERMISSIONS[member.role][resourceType] || [];
        if (rolePerms.includes(permission)) {
          await cacheService.set(cacheKey, true, 300);
          return true;
        }

        // Check custom permissions
        if (member.permissions.includes(permission)) {
          await cacheService.set(cacheKey, true, 300);
          return true;
        }
      }
    }

    // Check if user owns the resource
    if (resourceId && resourceType === 'draft') {
      const [draft] = await db
        .select({ authorId: drafts.authorId })
        .from(drafts)
        .where(eq(drafts.id, resourceId));

      if (draft?.authorId === userId) {
        await cacheService.set(cacheKey, true, 300);
        return true;
      }
    }

    await cacheService.set(cacheKey, false, 300);
    return false;
  },

  // Check multiple permissions at once
  async hasAnyPermission(
    userId: string,
    resourceType: ResourceType,
    permissions: Permission[],
    resourceId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, resourceType, permission, resourceId)) {
        return true;
      }
    }
    return false;
  },

  // Check all permissions
  async hasAllPermissions(
    userId: string,
    resourceType: ResourceType,
    permissions: Permission[],
    resourceId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, resourceType, permission, resourceId))) {
        return false;
      }
    }
    return true;
  },

  // Get all permissions for user on a resource
  async getUserPermissions(
    userId: string,
    resourceType: ResourceType,
    resourceId?: string
  ): Promise<Permission[]> {
    const permissions = new Set<Permission>();

    // Check permission overrides
    if (resourceId) {
      const overrides = permissionOverrides.get(userId) || [];
      const override = overrides.find(
        (o) => o.resourceType === resourceType && o.resourceId === resourceId
      );

      if (override && (!override.expiresAt || override.expiresAt > new Date())) {
        override.permissions.forEach((p) => permissions.add(p));
      }
    }

    // Check team memberships
    const userTeams = await this.getUserTeams(userId);

    for (const team of userTeams) {
      const member = (teamMembers.get(team.id) || []).find((m) => m.userId === userId);
      if (member && member.status === 'active') {
        const rolePerms = ROLE_PERMISSIONS[member.role][resourceType] || [];
        rolePerms.forEach((p) => permissions.add(p));
        member.permissions.forEach((p) => permissions.add(p));
      }
    }

    // Check ownership
    if (resourceId && resourceType === 'draft') {
      const [draft] = await db
        .select({ authorId: drafts.authorId })
        .from(drafts)
        .where(eq(drafts.id, resourceId));

      if (draft?.authorId === userId) {
        // Owner has all permissions
        const allPerms: Permission[] = ['create', 'read', 'update', 'delete', 'publish', 'unpublish'];
        allPerms.forEach((p) => permissions.add(p));
      }
    }

    return Array.from(permissions);
  },

  // ============ Team Management ============

  // Create team
  async createTeam(
    ownerId: string,
    name: string,
    description?: string
  ): Promise<Team> {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const team: Team = {
      id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId,
      name,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      description: description || null,
      createdAt: new Date(),
      settings: {
        allowPublicJoin: false,
        defaultRole: 'contributor',
        requireApproval: true,
      },
    };

    teams.set(team.id, team);

    // Add owner as team member
    const ownerMember: TeamMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: ownerId,
      teamId: team.id,
      role: 'owner',
      permissions: [],
      invitedBy: ownerId,
      invitedAt: new Date(),
      acceptedAt: new Date(),
      status: 'active',
    };

    teamMembers.set(team.id, [ownerMember]);

    logger.info({ teamId: team.id, ownerId }, 'Team created');

    return team;
  },

  // Get team by ID
  async getTeam(teamId: string): Promise<Team | null> {
    return teams.get(teamId) || null;
  },

  // Get user's teams
  async getUserTeams(userId: string): Promise<Team[]> {
    const userTeamsList: Team[] = [];

    for (const [teamId, members] of teamMembers.entries()) {
      const isMember = members.some((m) => m.userId === userId && m.status === 'active');
      if (isMember) {
        const team = teams.get(teamId);
        if (team) userTeamsList.push(team);
      }
    }

    return userTeamsList;
  },

  // Update team settings
  async updateTeamSettings(
    teamId: string,
    userId: string,
    settings: Partial<Team['settings']>
  ): Promise<Team | null> {
    const team = teams.get(teamId);
    if (!team) return null;

    // Check permission
    const canManage = await this.hasPermission(userId, 'team', 'manage_settings', teamId);
    if (!canManage) return null;

    team.settings = { ...team.settings, ...settings };
    teams.set(teamId, team);

    return team;
  },

  // Delete team
  async deleteTeam(teamId: string, userId: string): Promise<boolean> {
    const team = teams.get(teamId);
    if (!team || team.ownerId !== userId) return false;

    teams.delete(teamId);
    teamMembers.delete(teamId);

    // Clear related caches
    await cacheService.delete(`team:${teamId}`);

    logger.info({ teamId, userId }, 'Team deleted');

    return true;
  },

  // ============ Team Member Management ============

  // Invite member to team
  async inviteMember(
    teamId: string,
    inviterId: string,
    email: string,
    role: Role
  ): Promise<{ success: boolean; member?: TeamMember; error?: string }> {
    const team = teams.get(teamId);
    if (!team) {
      return { success: false, error: 'Team not found' };
    }

    // Check if inviter can manage team
    const canManage = await this.hasPermission(inviterId, 'team', 'manage_team', teamId);
    if (!canManage) {
      return { success: false, error: 'Permission denied' };
    }

    // Find user by email
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if already a member
    const members = teamMembers.get(teamId) || [];
    if (members.some((m) => m.userId === user.id)) {
      return { success: false, error: 'User is already a team member' };
    }

    // Can't assign a higher role than your own
    const inviterRole = members.find((m) => m.userId === inviterId)?.role;
    if (inviterRole && !this.isRoleHigherOrEqual(inviterRole, role)) {
      return { success: false, error: 'Cannot assign a role higher than your own' };
    }

    const member: TeamMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      teamId,
      role,
      permissions: [],
      invitedBy: inviterId,
      invitedAt: new Date(),
      acceptedAt: null,
      status: 'pending',
    };

    members.push(member);
    teamMembers.set(teamId, members);

    logger.info({ teamId, userId: user.id, role }, 'Team member invited');

    return { success: true, member };
  },

  // Accept team invitation
  async acceptInvitation(teamId: string, userId: string): Promise<boolean> {
    const members = teamMembers.get(teamId) || [];
    const member = members.find((m) => m.userId === userId && m.status === 'pending');

    if (!member) return false;

    member.status = 'active';
    member.acceptedAt = new Date();

    // Clear permission cache
    await this.clearUserPermissionCache(userId);

    logger.info({ teamId, userId }, 'Team invitation accepted');

    return true;
  },

  // Update member role
  async updateMemberRole(
    teamId: string,
    updaterId: string,
    memberId: string,
    newRole: Role
  ): Promise<boolean> {
    const members = teamMembers.get(teamId) || [];
    const member = members.find((m) => m.id === memberId);
    const updater = members.find((m) => m.userId === updaterId);

    if (!member || !updater) return false;

    // Can't change owner
    if (member.role === 'owner') return false;

    // Can't assign a higher role than your own
    if (!this.isRoleHigherOrEqual(updater.role, newRole)) return false;

    member.role = newRole;

    // Clear permission cache
    await this.clearUserPermissionCache(member.userId);

    logger.info({ teamId, memberId, newRole }, 'Member role updated');

    return true;
  },

  // Remove member from team
  async removeMember(
    teamId: string,
    removerId: string,
    memberIdOrUserId: string
  ): Promise<boolean> {
    const members = teamMembers.get(teamId) || [];
    const memberIndex = members.findIndex(
      (m) => m.id === memberIdOrUserId || m.userId === memberIdOrUserId
    );

    if (memberIndex === -1) return false;

    const member = members[memberIndex];

    // Can't remove owner
    if (member.role === 'owner') return false;

    // Check permission
    const canManage = await this.hasPermission(removerId, 'team', 'manage_team', teamId);
    if (!canManage && removerId !== member.userId) return false;

    members.splice(memberIndex, 1);
    teamMembers.set(teamId, members);

    // Clear permission cache
    await this.clearUserPermissionCache(member.userId);

    logger.info({ teamId, memberId: member.id }, 'Member removed from team');

    return true;
  },

  // Get team members
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return teamMembers.get(teamId) || [];
  },

  // ============ Permission Overrides ============

  // Grant specific permission on resource
  async grantPermission(
    granterId: string,
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    permission: Permission,
    expiresAt?: Date
  ): Promise<boolean> {
    // Check if granter has permission to grant
    const canGrant = await this.hasPermission(granterId, resourceType, permission, resourceId);
    if (!canGrant) return false;

    const userOverrides = permissionOverrides.get(userId) || [];

    // Check if override already exists
    let override = userOverrides.find(
      (o) => o.resourceType === resourceType && o.resourceId === resourceId
    );

    if (override) {
      if (!override.permissions.includes(permission)) {
        override.permissions.push(permission);
      }
      override.expiresAt = expiresAt || null;
    } else {
      override = {
        resourceType,
        resourceId,
        userId,
        permissions: [permission],
        grantedBy: granterId,
        grantedAt: new Date(),
        expiresAt: expiresAt || null,
      };
      userOverrides.push(override);
    }

    permissionOverrides.set(userId, userOverrides);

    // Clear cache
    await this.clearUserPermissionCache(userId);

    logger.info({ granterId, userId, resourceType, resourceId, permission }, 'Permission granted');

    return true;
  },

  // Revoke specific permission on resource
  async revokePermission(
    revokerId: string,
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    permission: Permission
  ): Promise<boolean> {
    const userOverrides = permissionOverrides.get(userId) || [];
    const override = userOverrides.find(
      (o) => o.resourceType === resourceType && o.resourceId === resourceId
    );

    if (!override) return false;

    const permIndex = override.permissions.indexOf(permission);
    if (permIndex > -1) {
      override.permissions.splice(permIndex, 1);

      if (override.permissions.length === 0) {
        const overrideIndex = userOverrides.indexOf(override);
        userOverrides.splice(overrideIndex, 1);
      }

      permissionOverrides.set(userId, userOverrides);

      // Clear cache
      await this.clearUserPermissionCache(userId);

      logger.info({ revokerId, userId, resourceType, resourceId, permission }, 'Permission revoked');
    }

    return true;
  },

  // Clear user's permission cache
  async clearUserPermissionCache(userId: string): Promise<void> {
    // In production, this would clear all permission-related cache keys for the user
    // Using a pattern like perm:${userId}:*
    logger.debug({ userId }, 'Permission cache cleared');
  },

  // ============ Utility ============

  // Get role display info
  getRoleInfo(role: Role): { name: string; description: string; color: string } {
    const info: Record<Role, { name: string; description: string; color: string }> = {
      owner: { name: 'Owner', description: 'Full control over team and resources', color: '#9b59b6' },
      admin: { name: 'Admin', description: 'Can manage team members and most settings', color: '#e74c3c' },
      editor: { name: 'Editor', description: 'Can create, edit, and publish content', color: '#3498db' },
      author: { name: 'Author', description: 'Can create and edit own content', color: '#2ecc71' },
      contributor: { name: 'Contributor', description: 'Can create drafts for review', color: '#f1c40f' },
      viewer: { name: 'Viewer', description: 'Read-only access', color: '#95a5a6' },
    };

    return info[role];
  },
};
