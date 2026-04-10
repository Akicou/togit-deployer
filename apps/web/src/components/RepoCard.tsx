import { Link } from 'react-router-dom';
import type { Repository } from '../types';
import DeployBadge from './DeployBadge';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ExternalLink, Rocket } from 'lucide-react';

interface RepoCardProps {
  repo: Repository;
  onDeploy?: (id: number, name: string) => void;
  canDeploy?: boolean;
}

export default function RepoCard({ repo, onDeploy, canDeploy = false }: RepoCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <Link to={`/repositories/${repo.id}`} className="font-semibold text-foreground hover:underline block truncate">
              {repo.full_name}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">
              {repo.service_name}{repo.project_name ? ` · ${repo.project_name}` : ''}
            </p>
          </div>
          <DeployBadge status={repo.last_deployment_status || 'never'} />
        </div>

        <div className="flex gap-1.5 mb-3 flex-wrap">
          <Badge variant={repo.deploy_mode === 'release' ? 'default' : 'secondary'} className="text-xs capitalize">
            {repo.deploy_mode}
          </Badge>
          {repo.private && <Badge variant="outline" className="text-xs">Private</Badge>}
        </div>

        {repo.last_deployed_ref && (
          <p className="font-mono text-xs text-muted-foreground mb-2">
            Last: {repo.last_deployed_ref.substring(0, 12)}
          </p>
        )}

        {repo.last_tunnel_url && (
          <a href={repo.last_tunnel_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-3 truncate">
            <ExternalLink className="w-3 h-3 shrink-0" />{repo.last_tunnel_url}
          </a>
        )}

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link to={`/repositories/${repo.id}`}>View</Link>
          </Button>
          {canDeploy && onDeploy && (
            <Button size="sm" className="flex-1" onClick={() => onDeploy(repo.id, repo.full_name)}>
              <Rocket className="w-3 h-3" />Deploy
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
