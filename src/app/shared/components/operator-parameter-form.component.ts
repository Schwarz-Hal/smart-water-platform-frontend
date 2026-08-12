import { Component, Input, OnChanges, SimpleChanges, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { FieldType, FieldTypeConfig, FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';

export type ParameterSchema = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
};

@Component({
  selector: 'app-formly-slider-field',
  imports: [MatInputModule, MatSliderModule, ReactiveFormsModule],
  template: `
    <div class="slider-field">
      <mat-slider [min]="props.min ?? 0" [max]="props.max ?? 100" [step]="props.step ?? 1">
        <input matSliderThumb [value]="formControl.value" (valueChange)="setValue($event)" />
      </mat-slider>
      <input matInput type="number" [min]="props.min" [max]="props.max" [step]="props.step ?? 1" [value]="formControl.value" (input)="setValue($any($event.target).value)" />
    </div>
  `,
  styles: `.slider-field{display:grid;grid-template-columns:minmax(100px,1fr) 84px;align-items:center;gap:10px}.slider-field mat-slider{width:100%}.slider-field>input{width:100%;border:1px solid var(--sw-border);border-radius:var(--sw-radius-sm);padding:7px;background:var(--sw-surface-raised);color:var(--sw-text-primary)}`,
})
export class FormlySliderFieldTypeComponent extends FieldType<FieldTypeConfig> {
  setValue(value: unknown): void {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) this.formControl.setValue(numeric);
  }
}

@Component({
  selector: 'app-formly-json-field',
  imports: [MatInputModule],
  template: `<textarea matInput rows="6" [value]="jsonValue" (input)="updateJson($any($event.target).value)"></textarea>@if(jsonError){<small class="error">{{ jsonError }}</small>}`,
  styles: `textarea{width:100%;font-family:ui-monospace,monospace;border:1px solid var(--sw-border);border-radius:var(--sw-radius-sm);padding:8px;background:var(--sw-surface-raised);color:var(--sw-text-primary)}.error{color:var(--sw-color-danger)}`,
})
export class FormlyJsonFieldTypeComponent extends FieldType<FieldTypeConfig> {
  jsonError = '';
  get jsonValue(): string { return JSON.stringify(this.formControl.value ?? {}, null, 2); }
  updateJson(value: string): void {
    try {
      this.formControl.setValue(JSON.parse(value));
      this.formControl.setErrors(null);
      this.jsonError = '';
    } catch {
      this.formControl.setErrors({ json: true });
      this.jsonError = '请输入合法 JSON。';
    }
  }
}

@Component({
  selector: 'app-operator-parameter-form',
  imports: [ReactiveFormsModule, FormlyModule, FormlyMaterialModule],
  template: `
    @if (fields.length) {
      <formly-form [form]="form" [fields]="fields" [model]="formModel" (modelChange)="handleModelChange($event)" />
    } @else {
      <p class="empty">该算子没有可配置参数。</p>
    }
  `,
  styles: `:host{display:block}.empty{color:var(--sw-text-muted);font-size:12px}:host ::ng-deep .mat-mdc-form-field{width:100%}:host ::ng-deep .mat-mdc-form-field-subscript-wrapper{min-height:18px}`,
})
export class OperatorParameterFormComponent implements OnChanges {
  @Input() schema: ParameterSchema = {};
  @Input() uiSchema: Record<string, Record<string, unknown>> = {};
  @Input() model: Record<string, unknown> = {};
  readonly parametersChange = output<Record<string, unknown>>();
  readonly validityChange = output<boolean>();
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [];
  formModel: Record<string, unknown> = {};
  private rebuilding = false;

  ngOnChanges(_changes: SimpleChanges): void {
    this.rebuilding = true;
    this.form = new FormGroup({});
    this.formModel = structuredClone(this.model ?? {});
    this.fields = this.buildFields(this.schema.properties ?? {}, new Set(this.schema.required ?? []));
    queueMicrotask(() => {
      this.rebuilding = false;
      this.validityChange.emit(this.form.valid);
    });
  }

  handleModelChange(value: Record<string, unknown>): void {
    if (this.rebuilding) return;
    this.formModel = { ...value };
    this.parametersChange.emit(structuredClone(this.formModel));
    queueMicrotask(() => this.validityChange.emit(this.form.valid));
  }

  private buildFields(properties: Record<string, ParameterSchema>, required: Set<string>): FormlyFieldConfig[] {
    return Object.entries(properties).map(([key, schema]) => this.fieldFor(key, schema, required.has(key)));
  }

  private fieldFor(key: string, schema: ParameterSchema, required: boolean): FormlyFieldConfig {
    const ui = this.uiSchema[key] ?? {};
    const props: Record<string, unknown> = {
      label: schema.title ?? key,
      description: schema.description,
      required,
      min: schema.minimum,
      max: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
    };
    if (schema.enum) {
      props['options'] = schema.enum.map((value) => ({ label: String(value), value }));
      return { key, type: 'select', props };
    }
    if (schema.type === 'boolean') return { key, type: 'checkbox', props };
    if (schema.type === 'number' || schema.type === 'integer') {
      props['type'] = 'number';
      props['step'] = schema.type === 'integer' ? 1 : Number(ui['step'] ?? 'any');
      return { key, type: ui['widget'] === 'slider' ? 'sw-slider' : 'input', props };
    }
    if (schema.type === 'object') {
      if (schema.properties) {
        return {
          key,
          wrappers: ['form-field'],
          props,
          fieldGroup: this.buildFields(schema.properties, new Set(schema.required ?? [])),
        };
      }
      return { key, type: 'sw-json', props };
    }
    props['type'] = ui['widget'] === 'datetime' || schema.type === 'datetime' ? 'datetime-local' : 'text';
    return { key, type: ui['widget'] === 'textarea' ? 'textarea' : 'input', props };
  }
}
