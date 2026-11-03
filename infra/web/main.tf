# Where hoa's web app deploys, from the shared cloudflare-web module: the demo's Worker, hoa, and pull request previews
# of it, with the GitHub environment settings and the deploy token the shared web templates read. The terraform-apply
# workflow runs it with its state in R2. The jobs in pull-request.yml, deploy.yml and preview-cleanup.yml don't read
# these settings yet; they move onto the shared templates in a later change.
terraform {
  required_version = "= 1.16.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
  }
  # The bucket and R2 endpoint are given to terraform init; the state key is fixed here.
  backend "s3" {
    key                         = "hoa/web/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

# CLOUDFLARE_API_TOKEN and GITHUB_TOKEN come from the environment (token test).
provider "cloudflare" {}

provider "github" {
  owner = "betterapps-hq"
}

locals {
  # The Cloudflare account the Workers are in, which the repository variable CLOUDFLARE_ACCOUNT_ID names too.
  account_id = "544b5bfd594cd02a5da4b79a2038cc9f"
}

module "web" {
  source = "git::https://github.com/betterapps-hq/pipelines.git//terraform/cloudflare-web?ref=ed34ffcba2ef6748b0210c763582e8995c81501b" # v1.6.0

  account_id  = local.account_id
  repository  = "hoa"
  name_prefix = "hoa"

  # The demo is the only environment the app deploys to: the hoa Worker, served on workers.dev with preview URLs, as
  # wrangler.jsonc's workers_dev and preview_urls say. The demo environment exists already, so the module writes into
  # it rather than owning it.
  environments = {
    demo = {
      worker_name  = "hoa"
      workers_dev  = true
      preview_urls = true
    }
  }

  # Each pull request is a Worker preview of the demo's Worker, with the preview environment the module owns. Previews
  # share the hoa-preview D1 database, which wrangler.jsonc's previews block binds, so there's no Neon.
  previews = {
    worker_of = "demo"
  }

  # Deploys and previews migrate and seed D1 with the same token.
  token_permissions = ["Workers Scripts Write", "D1 Write"]
}

# The hoa Worker has deployed since 2026-10-08, so it's adopted rather than made again. Its workers.dev and preview URLs
# are on, as the module sets them, so importing it changes nothing.
import {
  to = module.web.cloudflare_worker.web["demo"]
  id = "${local.account_id}/hoa"
}

output "web" {
  description = "The demo's Worker and public URL."
  value       = module.web.environments
}

output "previews" {
  description = "The previews' GitHub environment and the Worker they're previews of."
  value       = module.web.previews
}
