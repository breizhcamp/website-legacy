(function() {
    'use strict';

    angular.module('programme', ['ngSanitize', 'hc.marked', 'ngLocale', 'ngAnimate', 'ui.bootstrap', 'ui.calendar'])
        .controller('ProgrammeCtrl', ['$scope', '$http', '$q', 'marked', 'dateFilter', '$uibModal', 'uiCalendarConfig', '$window', '$filter', function($scope, $http, $q, marked, dateFilter, $uibModal, uiCalendarConfig, $window, $filter) {

            var moment = $window.moment;

            var formatDefinitions = this.formatDefinitions = [
                {format: 'Conférence', label: 'Conférence', icon: 'fa-slideshare'},
                {format: 'Tool in Action', label: 'Tool in Action', icon: 'fa-wrench'},
                {format: 'Université', label: 'Université', icon: 'fa-terminal'},
                {format: 'Quickie', label: 'Quickie', icon: 'fa-clock-o'},
                {format: 'Lab', label: 'Lab', icon: 'fa-flask'},
                {format: 'Keynote', label: 'Keynote', icon: 'fa-user'},
                {format: 'Party', label: 'Party', 'icon': 'fa-glass'}
            ];

            var categoryColors = this.categoryColors = {
                'Objets connectés, IoT, Robotique': '#4B8865',
                'Cloud, Devops, Outils': '#CA5132',
                'Agilité, Méthodologie et Tests': '#C9880F',
                'Web et mobile': '#287F95',
                'BigData, Analytics et Machine Learning': '#BB283C',
                'Architecture, Performance et Sécurité': '#6B4162',
                'Backend et Desktop': '#7F71CE',
                'Langages': '#6AAA3E',
                'Keynote': '#F55E52',
                'Autre': '#AAAAAA'
            };

            var rooms = this.rooms = {
                'Amphi A': 'Amphi A',
                'Amphi B': 'Amphi B',
                'Amphi C': 'Amphi C',
                'Amphi D': 'Amphi D',
                'Lab': 'Espace Lab',
                'Hall': 'Hall'
            };

            var formats = _.indexBy(formatDefinitions, 'format');

            var startDate = '2017-04-19',
                endDate = '2017-04-21';
            var startMoment = moment(startDate),
                endMoment = moment(endDate).add(1, 'd'),
                now = moment();

            var defaultDate = (now.isBefore(startMoment) || now.isAfter(endMoment)) ? startDate : now.format('YYYY-MM-DD');

            function renderTitle(event) {
                var format = formats[event.format];
                return '<span class="fa-stack" title="' + format.label + '">' +
                    '<i class="fa fa-square fa-stack-2x"></i>' +
                    '<i style="color:' + event.color + ';" class="fa fa-stack-1x fa-inverse ' + format.icon + '"></i> ' +
                    '</span> ' + event.title +
                    (event.room ? ' <em>(' + event.room + ')</em>' : '') +
                    (event.slides ? ' <i class="fa fa-fw fa-file-powerpoint-o"></i>' : '') +
                    (event.video ? ' <i class="fa fa-fw fa-film"></i>' : '');
            }

            function refreshCalendar(calendar) {
                if (uiCalendarConfig.calendars[calendar]) {
                    uiCalendarConfig.calendars[calendar].fullCalendar('refetchEvents');
                }
            }

            var PDFDocument = $window.PDFDocument;

            var doc = new PDFDocument();
            var stream = doc.pipe(blobStream());

            this.calendarConfig = {
                defaultDate: defaultDate,
                defaultView: 'agendaDay',
                slotEventOverlap: false,
                slotDuration: '00:15:00',
                editable: false,
                header: {
                    left: '',
                    center: '',
                    right: 'prev,next'
                },
                titleFormat: {
                    day: ''
                },
                columnFormat: {
                    day: ''
                },
                allDaySlot: false,
                minTime: '08:30:00',
                maxTime: '21:00:00',
                axisFormat: 'HH:mm',
                contentHeight: 1275,
                height: 1275,
                timeFormat: {
                    agenda: 'HH:mm'
                },
                eventClick: function(calEvent) {
                    this.details(calEvent);
                }.bind(this),
                eventRender: function(event, element) {
                    element.find('.fc-title').html(renderTitle(event));
                    element.attr('title', event.title); // pour voir le titre en tooltip
                }
            };

            // filters key must match the event property the filter object aim to filter
            var filters = this.filters = {};
            // Category filter
            var categories = _.keys(categoryColors);
            filters.category = _.object(categories, _.map(categories, function() {
                return false;
            }));
            // Format filter
            filters.format = _.mapValues(formats, false);
            filters.room = _.mapValues(rooms, false);

            var refresh = this.refresh = function() {
                refreshCalendar('calendar');
            };

            this.clearSearch = function() {
                delete this.search;
                refresh();
            }.bind(this);

            // watch filters
            _.each(filters, function(filterObject) {
                $scope.$watchCollection(function() {
                    return filterObject;
                }, refresh);
            });

            $q.all([
                $http.get('/json/others.json'),
                /*$http(
                    {
                        method: 'GET',
                        url: 'https://api.cfp.io/api/schedule',
                        headers: {
                            'X-Tenant-Id': 'breizhcamp'
                        }
                    })*/
               $http.get('/json/talks.json')
            ]).then(function(responses) {
                return [].concat(responses[0].data, responses[1].data);
            }).then(function(talks) {

                function activeFilters() {
                    return _.pick(filters, function(filterObject) {
                        return _.any(filterObject, Boolean);
                    });
                }

                this.agenda = {
                    events: function(start, end, timezone, callback) {
                        var filters = activeFilters();
                        callback($filter('filter')(_.filter(_.map(talks, function(talk) {
                            return Object.assign({
                                title: talk.name,
                                format: talk.format,
                                category: talk.event_type,
                                description: talk.description,
                                speakers: talk.speakers,
                                start: talk.event_start,
                                end: talk.event_end,
                                color: categoryColors[talk.event_type],
                                room: rooms[talk.venue]
                            }, _.pick(talk, ['video', 'slides']));
                        }), function(talk) {
                            return _.all(filters, function(filter, name) {
                                return filter[talk[name]];
                            });
                        }), this.search));
                    }.bind(this)
                };
            }.bind(this));

            this.details = function(talk) {
                if (!talk.speakers || !talk.description) { // no detail if there is no description or no speaker
                    return;
                }
                $uibModal.open({
                    template: '<div class="modal-header">' +
                    '<button type="button" class="close" ng-click="$close()"><span>&times;</span></button>' +
                    '<h3 class="modal-title">' +
                    '<span class="fa-stack" title="{{::detailsCtrl.formats[detailsCtrl.talk.format].label}}">' +
                    '<i class="fa fa-square fa-stack-2x"></i>' +
                    '<i class="fa fa-stack-1x fa-inverse" ng-class="::detailsCtrl.formats[detailsCtrl.talk.format].icon"></i>' +
                    '</span>' +
                    '<span ng-bind="::detailsCtrl.talk.title"></span>' +
                    ' <a ng-href="{{::detailsCtrl.talk.video}}" ng-if="::detailsCtrl.talk.video" title="Voir la vidéo" target="_blank"><i class="fa fa-fw fa-film"></i></a> ' +
                    ' <a ng-href="{{::detailsCtrl.talk.slides}}" ng-if="::detailsCtrl.talk.slides" title="Voir les slides" target="_blank"><i class="fa fa-fw fa-file-powerpoint-o"></i></a> ' +
                    '</h3>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<em class="pull-right clearfix" ng-bind="::detailsCtrl.talk.room"></em>' +
                    '<p class="text-muted" ng-bind="::detailsCtrl.talk.category"></p>' +
                    '<div marked="::detailsCtrl.talk.description"></div>' +
                    '<p><strong>Speaker{{::detailsCtrl.talk.speakers.indexOf(\',\') !== -1 ? \'s\' : \'\'}}</strong>&nbsp;: {{::detailsCtrl.talk.speakers}}</p>' +
                    '</div>',
                    controller: function() {
                        this.talk = talk;
                        this.formats = formats;
                    },
                    controllerAs: 'detailsCtrl'
                });
            };
        }]);
})();
