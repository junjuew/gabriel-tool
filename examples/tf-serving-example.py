#!/usr/bin/env python
"""Example of using gabrieltool.statemachine with tensorflow/OpenTPOD models for analysis.

The TF models can be exported from OpenTPOD or any TF SavedModel that can be
served by TF-Serving.

An example model (SSD-MobilenetV2) can be downloaded from 
http://download.tensorflow.org/models/object_detection/ssd_mobilenet_v2_coco_2018_03_29.tar.gz
After downloading and unzipping the tar ball, rearrange the saved_model
directory in the original package into the following structure by renaming and 
making a version directory (00001).
The labels for COCO dataset can be found at 
https://github.com/tensorflow/models/blob/master/research/object_detection/data/mscoco_label_map.pbtxt

.
├── ssd_mobilenet_v2_saved_model
│   └── 00001
│       ├── saved_model.pb
│       └── variables
└── tf-serving-example.py

In this example, we create a naive 2-state FSM that detects the presence of a
person or a chair.

Usage: Run and see ./examples/tf-serving-example.py -h
"""

from __future__ import absolute_import, division, print_function

from functools import partial

import cv2
import fire
from logzero import logger
from gabriel_server.local_engine import runner as gabriel_runner

from gabrieltool.statemachine import fsm, predicate_zoo, processor_zoo, runner


def _build_fsm():
    """Build an example FSM for detecting a person.

    Returns:
        gabrieltool.statemchine.fsm.State -- The start state of the generated FSM.
    """
    # create a three state state machine
    st_start = fsm.State(
        name='start',
        processors=[],
        transitions=[
            fsm.Transition(
                name='tran_start_to_proc',
                predicates=[
                    fsm.TransitionPredicate(
                        partial_obj=partial(
                            predicate_zoo.always
                        )
                    )
                ],
                instruction=fsm.Instruction(audio='This app will tell you if a person or a chair is present.')
            )
        ]
    )
    st_tf = fsm.State(
        name='tf_serving',
        processors=[fsm.Processor(
            name='proc_start',
            callable_obj=processor_zoo.TFServingContainerCallable('ssd_mobilenet_v2',
                                                                  'examples/ssd_mobilenet_v2_saved_model',
                                                                  conf_threshold=0.8
                                                                  )
        )],
        transitions=[
            fsm.Transition(
                predicates=[
                    fsm.TransitionPredicate(
                        partial_obj=partial(
                            predicate_zoo.has_obj_cls,
                            cls_name='1'  # 1 is Person
                        )
                    )
                ],
                instruction=fsm.Instruction(audio='Found Person!')
            ),
            fsm.Transition(
                predicates=[
                    fsm.TransitionPredicate(
                        # custom predicate callable
                        # when chair is found in the scene.
                        partial_obj=lambda app_state: '62' in app_state
                    )
                ],
                instruction=fsm.Instruction(audio='Found Chair!')
            )
        ]
    )

    # transitions are created after the state objects
    st_start.transitions[0].next_state = st_tf
    st_tf.transitions[0].next_state = st_tf
    st_tf.transitions[1].next_state = st_tf
    return st_start


def generate_fsm(output_path):
    """Create and save an example FSM for detecting a person.

    Arguments:
        output_path {string} -- Path to save the FSM to.
    """
    start_state = _build_fsm()
    # save to disk
    with open(output_path, 'wb') as f:
        f.write(fsm.StateMachine.to_bytes(
            name='tf_serving_example',
            start_state=start_state
        ))


def run_fsm(video_uri=0):
    """Create and execute a state machine locally.

    Create a FSM and feed it images from video_uri. The output instruction is
    displayed on both command line and the OpenCV window.

    Keyword Arguments:
        video_uri {OpenCV VideoCapture Input String} -- id of the video
        capturing device to open. (default: {0}). For all supported formats, 
        see https://docs.opencv.org/master/d8/dfe/classcv_1_1VideoCapture.html.
    """
    start_state = _build_fsm()
    fsm_runner = runner.Runner(start_state)
    cam = cv2.VideoCapture(video_uri)
    while True:
        _, image = cam.read()
        inst = fsm_runner.feed(image)
        if inst is not None:
            logger.info('instruction text: {}'.format(inst.audio))
            cv2.putText(image, inst.audio, (100, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)
        cv2.imshow('input', image)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cam.release()
    cv2.destroyAllWindows()


def run_gabriel_server():
    """Create and execute a gabriel server for detecting people.

    This gabriel server uses a gabrieltool.statemachine.fsm to represents
    application logic. Use Gabriel Client to stream images and receive feedback.
    """
    logger.info('Building Person Detection FSM...')
    start_state = _build_fsm()
    logger.info('Initializing Cognitive Engine...')
    # engine_name has to be 'instruction' to work with
    # gabriel client from App Store. Someone working on Gabriel needs to fix this.
    engine_name = 'instruction'
    logger.info('Launching Gabriel server...')
    gabriel_runner.run(
        engine_setup=lambda: runner.BasicCognitiveEngineRunner(
            engine_name=engine_name, fsm=start_state),
        engine_name=engine_name,
        input_queue_maxsize=60,
        port=9099,
        num_tokens=1
    )


def run_gabriel_server_from_saved_fsm(pbfsm_path):
    """Create and execute a gabriel server for detecting people.

    This gabriel server uses a gabrieltool.statemachine.fsm to represents
    application logic. Use Gabriel Client to stream images and receive feedback.

    Arguments:
        pbfsm_path {string} -- File path of FSM file (e.g. examples/tf-serving-example.pbfsm).
    """
    start_state = None
    logger.info('Loading FSM from {}...'.format(pbfsm_path))
    with open(pbfsm_path, 'rb') as f:
        start_state = fsm.StateMachine.from_bytes(f.read())
    start_state = _build_fsm()
    logger.info('Initializing Cognitive Engine...')
    # engine_name has to be 'instruction' to work with
    # gabriel client from App Store. Someone working on Gabriel needs to fix this.
    engine_name = 'instruction'
    logger.info('Launching Gabriel server...')
    gabriel_runner.run(
        engine_setup=lambda: runner.BasicCognitiveEngineRunner(
            engine_name=engine_name, fsm=start_state),
        engine_name=engine_name,
        input_queue_maxsize=60,
        port=9099,
        num_tokens=1
    )


if __name__ == '__main__':
    fire.Fire({
        'generate_fsm': generate_fsm,
        'run_fsm': run_fsm,
        'run_gabriel_server': run_gabriel_server,
        'run_gabriel_server_from_saved_fsm': run_gabriel_server_from_saved_fsm,
    })
