import { Home } from 'lucide-react';

type Props = {
	className?: string;
};

export default function HomeLink({ className }: Props) {
	return <Home className={className} size={20} strokeWidth={1.75} aria-hidden="true" />;
}
