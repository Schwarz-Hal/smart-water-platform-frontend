import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideFormlyCore } from '@ngx-formly/core';
import { withFormlyMaterial } from '@ngx-formly/material';
import { describe, expect, it, vi } from 'vitest';

import {
  FormlyJsonFieldTypeComponent,
  FormlySliderFieldTypeComponent,
  OperatorParameterFormComponent,
} from './operator-parameter-form.component';

describe('OperatorParameterFormComponent', () => {
  function createComponent(): OperatorParameterFormComponent {
    TestBed.configureTestingModule({
      imports: [OperatorParameterFormComponent],
      providers: [
        provideNoopAnimations(),
        provideFormlyCore([
          ...withFormlyMaterial(),
          {
            types: [
              { name: 'sw-slider', component: FormlySliderFieldTypeComponent },
              { name: 'sw-json', component: FormlyJsonFieldTypeComponent },
            ],
          },
        ]),
      ],
    });
    return TestBed.createComponent(OperatorParameterFormComponent).componentInstance;
  }

  it('maps schemas to typed Formly controls', () => {
    const component = createComponent();
    component.schema = {
      type: 'object',
      required: ['threshold'],
      properties: {
        threshold: { type: 'number', minimum: 0, maximum: 10 },
        count: { type: 'integer' },
        enabled: { type: 'boolean' },
        mode: { type: 'string', enum: ['safe', 'fast'] },
        metadata: { type: 'object' },
      },
    };
    component.uiSchema = { threshold: { widget: 'slider', step: 0.1 } };
    component.model = { threshold: 2.5, count: 4, enabled: true, mode: 'safe', metadata: {} };

    component.ngOnChanges({});

    expect(component.fields.map((field) => field.type)).toEqual([
      'sw-slider',
      'input',
      'checkbox',
      'select',
      'sw-json',
    ]);
    expect(component.fields[0].props?.['required']).toBe(true);
    expect(component.fields[1].props?.['step']).toBe(1);
  });

  it('keeps numeric and boolean values when emitting a node model', () => {
    const component = createComponent();
    const emit = vi.spyOn(component.parametersChange, 'emit');
    component.handleModelChange({ threshold: 2.5, enabled: false });
    expect(emit).toHaveBeenCalledWith({ threshold: 2.5, enabled: false });
    expect(typeof emit.mock.calls[0][0]['threshold']).toBe('number');
    expect(typeof emit.mock.calls[0][0]['enabled']).toBe('boolean');
  });
});
