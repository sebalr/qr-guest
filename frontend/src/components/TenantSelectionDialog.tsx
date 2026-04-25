import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Tenant {
	id: string;
	name: string;
	role: string;
}

interface TenantSelectionDialogProps {
	tenants: Tenant[];
	onSelect: (tenantId: string) => Promise<void>;
	isOpen: boolean;
}

export function TenantSelectionDialog({ tenants, onSelect, isOpen }: TenantSelectionDialogProps) {
	const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.id || '');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSelect = async () => {
		if (!selectedTenantId) {
			setError('Please select a tenant');
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			await onSelect(selectedTenantId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to select tenant');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={() => {}}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Select Tenant</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<p className="text-sm text-gray-600">You have access to multiple tenants. Please select which one you'd like to access:</p>

					<Select
						value={selectedTenantId}
						onValueChange={setSelectedTenantId}>
						<SelectTrigger>
							<SelectValue placeholder="Select a tenant" />
						</SelectTrigger>
						<SelectContent>
							{tenants.map(tenant => (
								<SelectItem
									key={tenant.id}
									value={tenant.id}>
									<div className="flex flex-col">
										<span>{tenant.name}</span>
										<span className="text-xs text-gray-500">({tenant.role})</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{error && <div className="text-sm text-red-600">{error}</div>}

					<Button
						onClick={handleSelect}
						disabled={isLoading}
						className="w-full">
						{isLoading ? 'Selecting...' : 'Continue'}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
