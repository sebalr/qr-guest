import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, id, ...props }, ref) => {
	return (
		<label
			htmlFor={id}
			className="inline-flex items-center gap-2 cursor-pointer select-none">
			<input
				type="checkbox"
				id={id}
				ref={ref}
				className={cn(
					'h-4 w-4 rounded border border-input bg-background accent-primary cursor-pointer',
					className,
				)}
				{...props}
			/>
			{label && <span className="text-sm">{label}</span>}
		</label>
	);
});
Checkbox.displayName = 'Checkbox';

export { Checkbox };
