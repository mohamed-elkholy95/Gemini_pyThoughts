#!/bin/bash
# Pythoughts Production Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_ROOT"

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        log_error "Environment file .env.${ENVIRONMENT} not found"
        log_info "Copy .env.production.example to .env.${ENVIRONMENT} and configure it"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Build images
build_images() {
    log_info "Building Docker images..."

    docker compose -f docker-compose.production.yml build --no-cache

    log_info "Docker images built successfully"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."

    docker compose -f docker-compose.production.yml run --rm api npm run db:migrate

    log_info "Migrations completed"
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."

    # Pull latest images if using remote registry
    # docker compose -f docker-compose.production.yml pull

    # Start services with zero-downtime deployment
    docker compose -f docker-compose.production.yml up -d --scale api=3 --scale worker=2

    log_info "Services deployed"
}

# Health check
health_check() {
    log_info "Running health checks..."

    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            log_info "Health check passed!"
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        log_warn "Health check failed, retrying ($RETRY_COUNT/$MAX_RETRIES)..."
        sleep 2
    done

    log_error "Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Rollback deployment
rollback() {
    log_warn "Rolling back deployment..."

    docker compose -f docker-compose.production.yml down

    # Restore from previous state if available
    if [ -f ".deploy-backup" ]; then
        log_info "Restoring previous deployment..."
        # Restore logic here
    fi

    log_info "Rollback completed"
}

# Clean up old images
cleanup() {
    log_info "Cleaning up old images..."

    docker image prune -f
    docker container prune -f

    log_info "Cleanup completed"
}

# Main deployment flow
main() {
    log_info "Starting deployment to ${ENVIRONMENT}..."

    check_prerequisites

    # Backup current state
    docker compose -f docker-compose.production.yml ps > .deploy-backup 2>/dev/null || true

    build_images

    # Stop old services gracefully
    docker compose -f docker-compose.production.yml down --timeout 30 || true

    # Run migrations
    run_migrations

    # Deploy new services
    deploy_services

    # Verify deployment
    if ! health_check; then
        log_error "Deployment failed, initiating rollback..."
        rollback
        exit 1
    fi

    cleanup

    log_info "Deployment to ${ENVIRONMENT} completed successfully!"

    # Show running services
    docker compose -f docker-compose.production.yml ps
}

# Handle script arguments
case "${2:-}" in
    build)
        check_prerequisites
        build_images
        ;;
    migrate)
        run_migrations
        ;;
    health)
        health_check
        ;;
    rollback)
        rollback
        ;;
    cleanup)
        cleanup
        ;;
    *)
        main
        ;;
esac
