import React, { Component } from "react";
import Modal from "react-bootstrap/lib/Modal";
import Button from "react-bootstrap/lib/Button";
import Form from "react-bootstrap/lib/Form";
import Col from "react-bootstrap/lib/Col";
import Row from "react-bootstrap/lib/Row";
import { Formik, Form as FormikForm, Field, FieldArray } from "formik";
import * as Yup from "yup";
import "./App.css";
import Select from 'react-select'
import procZoo from './processor-zoo.json';
import predZoo from './predicate-zoo.json';
import { FSMElementType } from "./toolbar.js";

/** Helper function to create options for Select elements
 * from a pre-defined callable zoo (procZoo or predZoo)
 * 
 * @param {*} zoo 
 */
const getZooOptions = (zoo) => {
  return Object.keys(zoo).map((key) => {
    return { value: key, label: key }
  })
}

/*
Customize the look of form fields using bootstrap.
These following React components should be passed as the "component"
property of a Formik field.
*/
const BSFormikField = ({
  field, // { name, value, onChange, onBlur }
  type,
  label,
  placeholder,
  defaultValue,
  ...props
}) => (
    <Form.Group as={Row}>
      <Form.Label column>{label}</Form.Label>
      <Col>
        <Form.Control
          required
          type={type}
          placeholder={placeholder}
          {...field}
          {...props}
          value={field.value || defaultValue || ''} // to supress uncontrolled to controlled warning
        />
      </Col>
      <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
    </Form.Group>
  );

/** Custom the look of a Formik Select field with react-select
 * 
 * @param {*} param0 
 */
const SelectFormikField = ({
  field,
  form, // values, setXXXX, handleXXXX, dirty, isValid, status, etc.
  label,
  selectOptions,
  ...props
}) => (
    <Form.Group as={Row}>
      <Form.Label column>{label}</Form.Label>
      <Col>
        <Select
          {...field}
          {...props}
          options={selectOptions}
          name={field.name}
          value={selectOptions ? selectOptions.find(option => option.value === field.value) : ''}
          onChange={(option) => form.setFieldValue(field.name, option.value)}
          onBlur={field.onBlur}
        />
      </Col>
    </Form.Group>
  )

const CallableNameField = ({
  field,  // name, value, onChange, onBlur
  ...props
}) => (
    <BSFormikField
      field={field}
      type="text"
      label="name"
      placeholder="Enter Name"
      {...props} />
  )

// const CallableTypeField = ({
//   field,
//   form, // values, setXXXX, handleXXXX, dirty, isValid, status, etc.
//   selectOptions,
//   ...props
// }) => (
//     <Form.Group as={Row}>
//       <Form.Label column>Type</Form.Label>
//       <Col>
//         <Select
//           {...field}
//           {...props}
//           options={selectOptions}
//           name={field.name}
//           value={selectOptions ? selectOptions.find(option => option.value === field.value) : ''}
//           onChange={(option) => form.setFieldValue(field.name, option.value)}
//           onBlur={field.onBlur}
//         />
//       </Col>
//     </Form.Group>
//   )

const CallableArgField = ({
  field,
  key, // unused. not passed to the field. just to suppress parent's react list warning
  label,
  placeholder,
  ...props
}) => (
    <BSFormikField
      field={field}
      type="text"
      label={label}
      placeholder={placeholder}
      {...props} />
  )

/*
Functions to create a group of form field to present a "callable".
The UIs to create a "callable" consist of following form fields:
1. callable name
2. callable type
3. A field for each callable argument (loaded from callable zoos)
*/
const createCallableMultiFields = (callableTitle, zoo, values, index, arrayHelpers) => {
  const zooOptions = getZooOptions(zoo);
  return (<div key={index} className="border">
    <h6>{callableTitle}</h6>
    <Field
      name={`callable.${index}.name`} // add values.callable[index].name
      component={CallableNameField} />
    <Field
      name={`callable.${index}.type`} // add values.callable[index].name
      component={(props) => <SelectFormikField {...props} label="Type" selectOptions={zooOptions} />} />
    {
      values.hasOwnProperty('callable') &&
      (values.callable[index] !== undefined) &&
      values['callable'][index]['type'] &&
      createCallableArgMultiFields(zoo[values['callable'][index]['type']], index)
    }
    <p>{JSON.stringify(values)}</p>
    <Form.Row>
      <Button
        variant="danger"
        onClick={() => arrayHelpers.remove({ index })}>
        Delete
    </Button>
    </Form.Row>
  </div>)
}

/*
Create a field for each callable argument.
*/
const createCallableArgMultiFields = (args, index) => {
  const argFields = Object.keys(args).map((key, argIndex) => {
    return <Field
      name={`callable.${index}.${key}`} // add values.callable[0].name
      component={CallableArgField}
      key={index + '-arg-' + argIndex}
      label={key}
      placeholder={args[key]} />
  })
  return argFields
}


/** Create transition basic fields including 
 * from and to state, and instructions.
 * 
 * @param {*} values 
 */
const createTransitionBasicFields = (fsm) => {
  const fsmStateOptions = fsm.getStatesList().map((state) => {
    return {value: state.getName(), label: state.getName()};
  });
  return (
    <>
      <Field
        name={"from"}
        component={(props) => <SelectFormikField {...props} label="From State" selectOptions={fsmStateOptions} />} />
      <Field
        name={"to"}
        component={(props) => <SelectFormikField {...props} label="To State" selectOptions={fsmStateOptions} />} />
      <Field
        name={"instruction.audio"}
        component={(props) => <BSFormikField {...props} type="text" label="Audio Instruction" />} />
      <Field
        name={"instruction.image"}
        component={(props) => <BSFormikField {...props} type="text" label="Image Instruction" />} />
      <Field
        name={"instruction.video"}
        component={(props) => <BSFormikField {...props} type="text" label="Video Instruction" />} />
    </>
  )
}


/**
 * A Modal used to create a new FSM element.
 * The core of the modal is a Formik form that captures
 * the user-inputted properties for the element
 */
class NewElementModal extends Component {
  constructor(props) {
    super(props);
    this.form = React.createRef();
  }

  render() {
    const { show, type, fsm, onModalCancel, onModalSave } = this.props;
    console.log(fsm)
    let title, callableTitle = "";
    let callableZoo = null;
    let callableButtonValue = "";
    switch (type) {
      case FSMElementType.STATE:
        title = "New State";
        callableTitle = "New Processor";
        callableButtonValue = "Add Processor"
        callableZoo = procZoo;
        break;
      case FSMElementType.TRANSITION:
        title = "New Transition";
        callableTitle = "New Predicate";
        callableButtonValue = "Add Predicate"
        callableZoo = predZoo;
        break;
      default:
        throw new Error("Unsupported Element Type: " + type + ". Failed to add a new element")
    }

    return (
      <Modal show={show} onHide={this.handleClose}>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Formik
            ref={this.form}
            initialValues={{
              name: "",
              callable: []
            }}
            onSubmit={(values, { props, setSubmitting }) => {
              onModalSave(values);
              setSubmitting(false);
            }
            }
            render={({ values }) => (
              <FormikForm>
                <FieldArray
                  name="callable"
                  render={(arrayHelpers) => {
                    return (
                      <>
                        <Field
                          name="name"
                          component={BSFormikField}
                          type="text"
                          label="Name"
                          placeholder="Enter Name" />
                        {
                          type === FSMElementType.TRANSITION &&
                          createTransitionBasicFields(fsm)
                        }
                        {
                          values.callable.map((eachCallable, index) => createCallableMultiFields(
                            callableTitle,
                            callableZoo,
                            values,
                            index,
                            arrayHelpers
                          ))
                        }
                        <Form.Row>
                          <Button
                            variant="light"
                            className="btn-block"
                            onClick={() => arrayHelpers.push({})}>
                            {callableButtonValue}
                          </Button>
                        </Form.Row>
                      </>
                    );
                  }}
                />
              </FormikForm>
            )
            }
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onModalCancel}>
            Close
          </Button>
          <Button variant="primary" onClick={(e) => {
            this.form.current.submitForm();
          }
          }>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }
}


export default NewElementModal;
