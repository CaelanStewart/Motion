export default class Draggable {
    constructor(container, selector, settings) {
        this.selector = selector;
        this.container = container;
        
        this.onMouseMoveHandler = event => this.onMouseMove(event);
        this.onMouseUpHandler = event => this.onMouseUp(event);
        this.onMouseDownHandler = event => this.onMouseDown(event);

        document.addEventListener('mousemove', this.onMouseMoveHandler);
        document.addEventListener('mouseup', this.onMouseUpHandler);

        this.currentObject = null;

        this.decelerationStack = [ ];
        this.animationLoopRunning = false;

        this._progressAnimations_bound = null;

        this.settings = {
            edgeFriction: 0.75,
            friction: 1,
            bounceFriction: 0.5,
            deceleration: true
        };

        if(typeof settings === 'object') {
            Object.assign(this.settings, settings);
        }

        this.events = {
            'drag-end': [ ],
            'drag-start': [ ],
            'drag-move': [ ],
            'deceleration-start': [ ],
            'deceleration-end': [ ],
            'decelerate': [ ],
            'stop': [ ]
        };

        this.initObjects();
    }
    
    destroy() {
        document.removeEventListener('mousemove', this.onMouseMoveHandler);
        document.removeEventListener('mouseup', this.onMouseUpHandler);

        if(typeof this.objects === 'object') {
            Array.prototype.forEach.call(this.objects, object => {
                object.removeEventListener('mousedown', this.onMouseDownHandler);
            });
        }
    }

    /**
     * Sets an event listener for a given event type
     *
     * @param {String} event - The event type: 'drag-end' | 'drag-start' | 'drag-move'
     * @param {function} callback
     */
    on(event, callback) {
        if(typeof this.events[event] !== 'object') {
            throw new Error('Invalid event type specified');
        }

        if(this.events[event].indexOf(callback) !== -1) {
            return;
        }

        this.events[event].push(callback);
    }

    /**
     * Removes a given event listener callback of a given event type
     *
     * @param {String} event - The event type: 'drag-end' | 'drag-start' | 'drag-move'
     * @param {function} callback
     */
    off(event, callback) {
        if(typeof this.events[event] !== 'object') {
            throw new Error('Invalid event type specified');
        }

        let callbackIndex = this.events[event].indexOf(callback);

        if(callbackIndex === -1) {
            return;
        }

        this.events[event].splice(callbackIndex, 1);
    }

    /**
     * Sets an event listener of a given type that executes exactly once, before being automatically removed.
     *
     * @param {String} event - The event type: 'drag-end' | 'drag-start' | 'drag-move'
     * @param callback
     * @returns {function(this:Draggable)}
     */
    once(event, callback) {
        let closure = (function() {
            callback.apply(this, arguments);

            this.off(event, callback);
        }).bind(this);

        this.on(event, closure);

        return closure;
    }

    /**
     * Triggers event listeners of a given type, passing along a given array of data as the functions arguments.
     *
     * @param {String} event - The event type: 'drag-end' | 'drag-start' | 'drag-move'
     * @param {Array} args - The arguments
     */
    trigger(event, args = [ ]) {
        if(typeof this.events[event] !== 'object') {
            throw new Error('Invalid event type specified');
        }

        this.events[event].forEach(callback => callback.apply(this, args))
    }

    /**
     * Initialises objects to be draggable, can be called again while there are current animations, and only the new
     * objects will be initialised.
     */
    initObjects() {
        if(typeof this.objects === 'object') {
            Array.prototype.forEach.call(this.objects, object => {
                object.removeEventListener('mousedown', this.onMouseDownHandler);
            });
        }
        
        this.objects = this.container.querySelectorAll(this.selector);

        Array.prototype.forEach.call(this.objects, object => {
            if(object.classList.contains('draggable-init'))
                return;

            Draggable.enable(object);

            object.addEventListener('mousedown', this.onMouseDownHandler);

            // if(this.settings.initialColour) {
            //     object.style.backgroundColor = this.settings.initialColour;
            // }
            //
            // if(this.settings.randomiseOpacity) {
            //     object.style.opacity = Math.random();
            // }
            //
            // if(this.settings.randomiseColour) {
            //     object.style.backgroundColor = 'rgba(' +
            //         ~~(Math.random() * 256) + ',' +
            //         ~~(Math.random() * 256) + ',' +
            //         ~~(Math.random() * 256) +
            //         ')';
            // }
            //
            // if(this.settings.randomiseInitialVelocity) {
            //     let objectRect = object.getBoundingClientRect();
            //
            //     this.onMouseDown({
            //         clientX: objectRect.left + ((objectRect.right - objectRect.left) / 2),
            //         clientY: objectRect.top + ((objectRect.bottom - objectRect.top) / 2),
            //         currentTarget: object
            //     });
            //
            //     object.__draggable_cache.velocity = {
            //         X: Math.random(),
            //         Y: Math.random()
            //     };
            //
            //     this.animateDeceleration(object);
            //
            //     this.currentObject = null;
            // }
        });
    }

    /**
     * Event listener callback for 'mousedown' event on objects.
     *
     * @param event
     */
    onMouseDown(event) {
        let object = event.currentTarget;
        
        if(!Draggable.enabled(object)) {
            return;
        }
        
        event.preventDefault();

        Draggable.cacheProperties(object);
        Draggable.cacheProperties(this.container);
        Draggable.cacheProperties(this.container);

        let cursorPosRelativeToContainer = Draggable.getCursorPositionRelativeTo(event, this.container),
            cursorPosRelativeToObject = Draggable.getCursorPositionRelativeTo(event, object),
            matrixString = window.getComputedStyle(object).transform,
            matrix = Draggable.parseMatrix(matrixString),
            position = {
                X: 0,
                Y: 0
            };

        ['X', 'Y'].forEach(axis => position[axis] = cursorPosRelativeToContainer[axis] - cursorPosRelativeToObject[axis]);

        Object.assign(object.__draggable_cache, {
            initialCursorPosRelativeToObject: cursorPosRelativeToObject,
            objectBounds: Draggable.getBoundsRelativeTo(object, this.container),
            time: Date.now(),
            velocity: {
                X: 0,
                Y: 0
            },
            hasMoved: false,
            position,
            matrix
        });

        let stackIndex = this.decelerationStack.indexOf(object);

        if(stackIndex !== -1) {
            this.decelerationStack.splice(stackIndex, 1);

            --this.stackLength;
        }

        object.__draggable_mouseIsDown = true;

        this.currentObject = object;

        this.trigger('drag-start', [object, position]);
    }

    /**
     * Event listener callback for 'mousemove' event on objects.
     *
     * @param event
     */
    onMouseMove(event) {
        event.preventDefault();

        if(!this.currentObject)
            return;

        let object = this.currentObject;

        if(object.__draggable_mouseIsDown) {
            let cache = object.__draggable_cache,
                cursorPosRelativeToContainer = Draggable.getCursorPositionRelativeTo(event, this.container),
                cursorPosRelativeToObject = cache.initialCursorPosRelativeToObject,
                objectBounds = cache.objectBounds,
                time = Date.now(),
                position = { };

            // Iterate through axis and apply bounds and edge friction
            [['X', 'width'], ['Y', 'height']].forEach(([axis, dimension]) => {
                position[axis] = cursorPosRelativeToContainer[axis] - cursorPosRelativeToObject[axis];

                ['min', 'max'].forEach(bound => {
                    if(Math[bound](position[axis], objectBounds[bound + axis]) === position[axis]) {
                        position[axis] = objectBounds[bound + axis] + ((position[axis] - objectBounds[bound + axis]) * (1 - this.settings.edgeFriction));
                    }
                });
            });

            let deltaTime = time - cache.time;

            ['X', 'Y'].forEach((axis, index) => cache.velocity[axis] = (position[axis] - cache.position[axis]) / deltaTime);

            cache.position = position;
            cache.time = time;
            cache.hasMoved = true;

            Draggable.setObjectMatrix(object, position);

            this.trigger('drag-move', [object, cache]);
        }
    }

    /**
     * Event listener callback for 'mouseup' event on objects.
     */
    onMouseUp(event) {
        event.preventDefault();

        if(!this.currentObject) {
            return;
        }

        let object = this.currentObject,
            cache = object.__draggable_cache,
            time = Date.now(),
            deltaTime = time - cache.time,
            objectBounds = cache.objectBounds,
            position = cache.position;

        if(deltaTime > 25 && cache.hasMoved) {
            cache.velocity.X = cache.velocity.Y = 0;
        }

        ['X', 'Y'].forEach((axis, index) => {
            ['min', 'max'].forEach(bound => {
                if(Math[bound](position[axis], objectBounds[bound + axis]) === position[axis])
                    cache.velocity[axis] = -((position[axis] - objectBounds[bound + axis]) / 100);
            });
        });

        this.trigger('drag-end', [object, position]);

        if(
            this.settings.deceleration && (
                Math.abs(cache.velocity.X) > 0 ||
                Math.abs(cache.velocity.Y) > 0
            )
        ) {
            this.animateDeceleration(this.currentObject);
        } else {
            // If no deceleration to consider, fire stop event.
            this.trigger('stop', [object, position]);
        }

        this.currentObject = null;
    }

    /**
     * Animate the deceleration on a given object.
     *
     * @param object - HTMLElement, Must have been initialised first
     */
    animateDeceleration(object) {
        let cache = object.__draggable_cache;
        
        this.trigger('deceleration-start', [object, cache.position]);
        
        this.stackLength = this.decelerationStack.push(object);

        cache.time = Date.now();

        if(!this.animationLoopRunning && this.stackLength) {
            this.animationLoopRunning = true;

            window.requestAnimationFrame(
                this.progressAnimations.bind(this)
            );
        }
    }

    /**
     * Progresses all current animations (technically, they're simulations, but... just semantics).
     */
    progressAnimations() {
        if(!this._progressAnimations_bound) {
            this._progressAnimations_bound = this.progressAnimations.bind(this);
        }

        let stack = this.decelerationStack,
            toRemoveFromStack = [ ];

        stack.forEach((object, index) => {
            let cache = object.__draggable_cache,
                time = Date.now(),
                deltaTime = time - cache.time,
                objectBounds = cache.objectBounds,
                velocity = { },
                position = { };

            Object.assign(position, cache.position);

            ['X', 'Y'].forEach((axis, axisIndex) => {
                velocity[axis] = cache.velocity[axis] * (1 - (deltaTime / 1000 * this.settings.friction));

                if(velocity[axis]) {
                    position[axis] = cache.position[axis] + (velocity[axis] * deltaTime);
                }

                ['min', 'max'].forEach(bound => {
                    if(Math[bound](position[axis], objectBounds[bound + axis]) === position[axis] && Math.sign(velocity[axis]) === Math[bound](1, -1)) {
                        velocity[axis] = -(velocity[axis] * (1 - this.settings.bounceFriction));
                        position[axis] = objectBounds[bound + axis];
                    }
                });
            });

            if(Math.abs(velocity.X) < 0.001 && Math.abs(velocity.Y) < 0.001) {
                // Round off positions before the final application to avoid pixel rounding glitches.
                ['X', 'Y'].forEach(axis => position[axis] = ~~position[axis]);
                
                this.trigger('deceleration-end', [object, position]);
                this.trigger('stop', [object, position]);

                toRemoveFromStack.push(index);
            }

            Draggable.setObjectMatrix(object, position);

            cache.time = time;
            cache.position = position;
            cache.velocity = velocity;
        });

        toRemoveFromStack.forEach(index => this.decelerationStack.splice(index, 1));

        this.stackLength -= toRemoveFromStack.length;

        // If there are no more items in the stack, stop animating
        if(this.stackLength <= 0) {
            this.stackLength = 0;
            this.animationLoopRunning = false;
        }

        this.trigger('decelerate', [stack]);

        if(this.animationLoopRunning) {
            window.requestAnimationFrame(this._progressAnimations_bound);
        }
    }

    /**
     * Get bounds of object relative to a given object.
     *
     * @param object - HTMLElement, must have been initialised by Draggable
     * @param to - HTMLElement: the element containing the given object
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    static getBoundsRelativeTo(object, to) {
        let objectCache = object.__draggable_cache,
            toCache = to.__draggable_cache,
            objectMargin = objectCache.margin,
            objectRect = objectCache.rect,
            toRect = toCache.rect,
            bounds = {
                minX: 0 + objectMargin.X,
                minY: 0 + objectMargin.Y,
                maxX: (toRect.right - toRect.left) - (objectRect.right - objectRect.left) - objectMargin.X,
                maxY: (toRect.bottom - toRect.top) - (objectRect.bottom - objectRect.top) - objectMargin.X
            };

        [['width', 'X'], ['height', 'Y']].forEach(([dimension, axis]) => {
            if(objectRect[dimension] > toRect[dimension]) {
                bounds['min' + axis] = -(objectRect[dimension] - toRect[dimension]);
                bounds['max' + axis] = 0;
            }
        });

        return bounds;
    }

    /**
     * Get position of object relative to a given element
     *
     * @param object - HTMLElement: Must have been initialised by Draggable
     * @param to - HTMLElement: the element to get a relative position to
     * @returns {{X: number, Y: number}}
     */
    static getPositionRelativeTo(object, to) {
        let objectCache = Draggable.getCache(object),
            toCache = Draggable.getCache(to);

        return {
            X: objectCache.rect.left - toCache.rect.left,
            Y: objectCache.rect.top - toCache.rect.top
        };
    }

    /**
     * Get cursor position relative to a given object.
     *
     * @param {MouseEvent} event - A MouseEvent object
     * @param to - The element to get the cursor position relative to
     * @returns {{X: number, Y: number}}
     */
    static getCursorPositionRelativeTo(event, to) {
        let rect = Draggable.getCache(to).rect;

        return {
            X: event.clientX - rect.left,
            Y: event.clientY - rect.top
        }
    }

    /**
     * Creates a cache object as a property of the given element object, and saves dimension information about the given
     * object.
     *
     * @param object
     */
    static cacheProperties(object) {
        if(typeof object.__draggable_cache !== 'object') {
            object.__draggable_cache = { };
        }
        
        let style = window.getComputedStyle(object);

        object.__draggable_cache.margin = {
            X: parseInt(style.marginLeft, 10),
            Y: parseInt(style.marginTop, 10)
        };
        
        object.__draggable_cache.rect = object.getBoundingClientRect();
    }

    /**
     * Returns the cache object property. Just syntactic sugar around the '__draggable_cache' object.
     *
     * @param object
     * @returns {*}
     */
    static getCache(object) {
        return object.__draggable_cache;
    }

    /**
     * Sets matrix of a given object to a given position, and then performs the transformation.
     *
     * @param object - HTMLElement: must have been initialised by Draggable
     * @param {object} position - The position of the object
     */
    static setObjectMatrix(object, position) {
        let cache = Draggable.getCache(object),
            rect = cache.rect,
            margin = cache.margin;

        [['X', 'width', 0], ['Y', 'height', 3]].forEach(
            ([axis, dimension, scaleIndex], index) => {
                let scaleMultiplier = (1 - cache.matrix[scaleIndex]);
                
                cache.matrix[4 + index] = position[axis] - margin[axis] - (scaleMultiplier * rect[dimension]);
            }
        );

        object.style.transform = 'matrix(' + cache.matrix.join(', ') + ')';
    }

    /**
     * Parses a given computed transformation, and returns an array. Returns a default matrix with no scale, translation
     * etc if the given matrix string could not be parsed.
     *
     * @param computedTransform
     * @returns {Array}
     */
    static parseMatrix(computedTransform) {
        let matrixIndex = computedTransform.indexOf('matrix'),
            leftBracketIndex = computedTransform.indexOf('(', matrixIndex),
            rightBracketIndex = computedTransform.indexOf(')', leftBracketIndex),
            matrixSequence = computedTransform.substring(leftBracketIndex + 1, rightBracketIndex),
            matrixSplit = matrixSequence.split(',').map(element => parseFloat(element));

        if(matrixIndex === -1 || matrixSplit.length !== 6) {
            return [1, 0, 0, 1, 0, 0];
        }

        return matrixSplit;
    }

    /**
     * Disable a given object, such that it may not be dragged.
     * 
     * @param object
     */
    static disable(object) {
        object.__draggable_enabled = false;
    }
    
    static enable(object) {
        object.__draggable_enabled = true;
    }
    
    static enabled(object) {
        return object.__draggable_enabled === true;
    }
}
