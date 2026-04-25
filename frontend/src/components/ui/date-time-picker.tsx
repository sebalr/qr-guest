import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface DateTimePickerProps {
	value?: Date;
	onChange?: (date: Date | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}

export function DateTimePicker({ value, onChange, placeholder = 'Pick a date & time', disabled, className }: DateTimePickerProps) {
	const [open, setOpen] = React.useState(false);

	const timeValue = value ? format(value, 'HH:mm') : '';

	function handleDaySelect(day: Date | undefined) {
		if (!day) {
			onChange?.(undefined);
			return;
		}
		const next = new Date(day);
		if (value) {
			next.setHours(value.getHours(), value.getMinutes(), 0, 0);
		} else {
			next.setHours(0, 0, 0, 0);
		}
		onChange?.(next);
	}

	function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
		const [hours, minutes] = e.target.value.split(':').map(Number);
		const next = value ? new Date(value) : new Date();
		next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
		onChange?.(next);
	}

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					disabled={disabled}
					className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}>
					<CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
					{value ? format(value, 'PPP, HH:mm') : <span>{placeholder}</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0"
				align="start">
				<Calendar
					mode="single"
					selected={value}
					onSelect={handleDaySelect}
					initialFocus
				/>
				<div className="border-t p-3">
					<div className="flex items-center gap-2">
						<label className="text-sm text-muted-foreground whitespace-nowrap">Time</label>
						<Input
							type="time"
							value={timeValue}
							onChange={handleTimeChange}
							className="h-8 text-sm"
						/>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
